import asyncio
import hashlib
import hmac
import importlib
import json
import os
import sys
import types

import pytest
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("NOWPAYMENTS_IPN_SECRET", "webhook-secret")
    import server
    return importlib.reload(server)


def test_signature_uses_canonical_json_and_rejects_invalid_signature(server_module):
    payload = {"payment_status": "finished", "order_id": "o1"}
    canonical = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    signature = hmac.new(b"webhook-secret", canonical, hashlib.sha512).hexdigest()
    raw_with_different_order_and_spacing = b'{ "payment_status": "finished", "order_id": "o1" }'

    parsed, signed_body = server_module._verify_nowpayments_signature(
        raw_with_different_order_and_spacing, signature,
    )

    assert parsed == payload
    assert signed_body == canonical
    with pytest.raises(HTTPException) as exc:
        server_module._verify_nowpayments_signature(canonical, "invalid")
    assert exc.value.status_code == 401


def test_canonical_replay_body_hits_unique_event_key(server_module):
    class WebhookEvents:
        def __init__(self):
            self.keys = set()

        async def insert_one(self, document):
            if document["event_key"] in self.keys:
                raise DuplicateKeyError("duplicate webhook")
            self.keys.add(document["event_key"])

    events = WebhookEvents()
    server_module.db = types.SimpleNamespace(webhook_events=events)
    payload = {"order_id": "o1", "payment_status": "finished"}
    canonical = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    signature = hmac.new(b"webhook-secret", canonical, hashlib.sha512).hexdigest()

    first = asyncio.run(server_module._register_webhook_event("nowpayments", signature, canonical))
    replay = asyncio.run(server_module._register_webhook_event("nowpayments", signature, canonical))

    assert first is True
    assert replay is False


def test_coupon_usage_claim_is_won_once_under_concurrency(server_module):
    class Coupons:
        def __init__(self):
            self.claimed_orders = set()
            self.lock = asyncio.Lock()

        async def update_one(self, query, update):
            order_id = query["counted_order_ids"]["$ne"]
            async with self.lock:
                if order_id in self.claimed_orders:
                    return types.SimpleNamespace(modified_count=0)
                self.claimed_orders.add(order_id)
                return types.SimpleNamespace(modified_count=1)

    class Orders:
        def __init__(self):
            self.update_count = 0

        async def update_one(self, query, update):
            self.update_count += 1
            return types.SimpleNamespace(modified_count=1)

    coupons = Coupons()
    orders = Orders()
    server_module.db = types.SimpleNamespace(coupons=coupons, orders=orders)
    order = {
        "id": "order-1",
        "email": "buyer@example.com",
        "coupon": {"code": "SAVE10"},
        "coupon_counted": False,
    }

    async def claim_concurrently():
        return await asyncio.gather(
            server_module._claim_coupon_usage(dict(order)),
            server_module._claim_coupon_usage(dict(order)),
        )

    results = asyncio.run(claim_concurrently())

    assert sorted(results) == [False, True]
    assert orders.update_count == 1


def test_batch_payout_claim_prevents_double_provider_call(server_module, monkeypatch):
    payout = {
        "id": "payout-1",
        "status": "ready",
        "payout_address": "0xabc",
        "currency": "usdt",
        "amount": 25,
    }

    class Cursor:
        async def to_list(self, limit):
            await asyncio.sleep(0)
            return [dict(payout)]

    class Payouts:
        def __init__(self):
            self.lock = asyncio.Lock()

        def find(self, query, projection):
            return Cursor()

        async def update_one(self, query, update):
            async with self.lock:
                required_status = query.get("status")
                if required_status and payout["status"] != required_status:
                    return types.SimpleNamespace(modified_count=0)
                payout.update(update.get("$set", {}))
                return types.SimpleNamespace(modified_count=1)

        async def update_many(self, query, update):
            required_status = query.get("status")
            if required_status and payout["status"] != required_status:
                return types.SimpleNamespace(modified_count=0)
            payout.update(update.get("$set", {}))
            return types.SimpleNamespace(modified_count=1)

    class Response:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"id": "batch-1"}

    provider_calls = []

    class HttpClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            provider_calls.append(kwargs["json"])
            await asyncio.sleep(0)
            return Response()

    async def fake_jwt(force=False):
        return "jwt"

    server_module.db = types.SimpleNamespace(affiliate_payouts=Payouts())
    server_module.NOWPAYMENTS_PAYOUT_ENABLED = True
    monkeypatch.setattr(server_module, "_refresh_np_jwt", fake_jwt)
    monkeypatch.setattr(server_module.httpx, "AsyncClient", HttpClient)
    request = types.SimpleNamespace(payout_ids=["payout-1"], otp=None)

    async def dispatch_concurrently():
        return await asyncio.gather(
            server_module.admin_affiliate_batch_payout(request, {"email": "admin@example.com"}),
            server_module.admin_affiliate_batch_payout(request, {"email": "admin@example.com"}),
            return_exceptions=True,
        )

    results = asyncio.run(dispatch_concurrently())

    assert len(provider_calls) == 1
    assert sum(isinstance(result, HTTPException) and result.status_code == 409 for result in results) == 1
    assert payout["status"] == "processing"