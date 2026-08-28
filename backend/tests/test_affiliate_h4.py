import asyncio
import importlib
import os
import sys
import types

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")
    monkeypatch.setenv("NOWPAYMENTS_PAYOUT_ENABLED", "true")
    import server
    return importlib.reload(server)


class DummyRequest:
    def __init__(self, cookies=None, headers=None):
        self.cookies = cookies or {}
        self.headers = headers or {}
        self.client = None


class DummyAffiliates:
    def __init__(self, affiliate):
        self.affiliate = affiliate

    async def find_one(self, query, projection=None):
        return self.affiliate


class DummyPayouts:
    def __init__(self, payout):
        self.payout = payout

    async def find_one(self, query, projection=None):
        if query.get("id") == self.payout.get("id"):
            return self.payout
        return None

    async def update_one(self, query, update):
        self.payout.update(update.get("$set", {}))
        return types.SimpleNamespace(modified_count=1)


class DummyReferrals:
    def __init__(self, docs):
        self.docs = docs

    async def update_many(self, query, update):
        target = update.get("$set", {})
        for doc in self.docs:
            if doc.get("payout_id") == query.get("payout_id"):
                if query.get("status"):
                    if doc.get("status") not in query["status"].get("$in", []):
                        continue
                doc.update(target)
        return types.SimpleNamespace(matched_count=len(self.docs))


def test_affiliate_attach_to_order_accepts_self_order_by_user_id(server_module):
    """L'auto-parrainage n'est plus bloqué.

    Ce test verifiait l'inverse : que la commande d'un affilie a lui-meme ne
    lui soit PAS rattachee. La regle a change — un affilie commande avec son
    propre code comme n'importe quel client, et la commande lui rapporte. On
    garde le test en le retournant plutot que de le supprimer : il tient
    desormais la nouvelle regle, et signalera une reintroduction accidentelle
    de l'ancienne.
    """
    affiliate = {"id": "aff-1", "code": "SELF", "status": "active", "user_id": "user-1"}
    server_module.db = types.SimpleNamespace(affiliates=DummyAffiliates(affiliate))

    order_doc = {"user_id": "user-1", "email": "customer@example.com"}
    request = DummyRequest(cookies={"fn_ref": "SELF"})

    asyncio.run(server_module.affiliate_attach_to_order(order_doc, request))

    assert order_doc.get("affiliate_id") == "aff-1"
    assert order_doc.get("affiliate_code") == "SELF"


def test_mark_paid_does_not_reactivate_reversed_referrals(server_module):
    payout = {"id": "payout-1", "status": "ready", "amount": 10, "currency": "btc"}
    referrals = [
        {"id": "r1", "payout_id": "payout-1", "status": "approved"},
        {"id": "r2", "payout_id": "payout-1", "status": "reversed"},
    ]
    server_module.db = types.SimpleNamespace(
        affiliate_payouts=DummyPayouts(payout),
        affiliate_referrals=DummyReferrals(referrals),
    )

    admin = {"email": "admin@example.com"}
    result = asyncio.run(server_module.admin_affiliate_mark_paid("payout-1", types.SimpleNamespace(reference="ref-1", note=""), admin))

    assert result["status"] == "paid"
    assert referrals[0]["status"] == "paid"
    assert referrals[1]["status"] == "reversed"


def test_execute_rejects_second_attempt_once_payout_is_claimed(server_module, monkeypatch):
    payout = {
        "id": "payout-2",
        "status": "ready",
        "amount": 10,
        "currency": "btc",
        "payout_address": "bc1qtest",
        "affiliate_code": "AFF",
        "period": "2026-08",
    }

    class ClaimingPayouts:
        def __init__(self, doc):
            self.doc = doc

        async def find_one(self, query, projection=None):
            return dict(self.doc)

        async def update_one(self, query, update):
            self.doc.update(update.get("$set", {}))
            return types.SimpleNamespace(modified_count=1)

    server_module.db = types.SimpleNamespace(
        affiliate_payouts=ClaimingPayouts(payout),
        affiliate_referrals=types.SimpleNamespace(),
    )

    calls = []

    async def fake_create(withdrawals, description=""):
        calls.append((withdrawals, description))
        return {"id": "batch-42"}

    monkeypatch.setattr(server_module, "_np_create_payout", fake_create)

    admin = {"email": "admin@example.com"}
    first = asyncio.run(server_module.admin_payout_execute("payout-2", admin))
    assert first["status"] == "creating"

    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.admin_payout_execute("payout-2", admin))
    assert exc.value.status_code == 400
    assert len(calls) == 1
