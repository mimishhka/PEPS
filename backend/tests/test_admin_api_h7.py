import asyncio
import importlib
import os
import sys
import types

import pytest
from pymongo.errors import DuplicateKeyError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")
    import server
    return importlib.reload(server)


class DummyUpdateResult:
    def __init__(self, modified_count):
        self.modified_count = modified_count


def test_admin_update_order_uses_paid_transition_and_rejects_unknown_status(server_module, monkeypatch):
    class DummyOrdersCollection:
        def __init__(self):
            self.order = {
                "id": "o1",
                "payment_status": "awaiting_crypto",
                "fulfillment_status": "pending",
                "email": "buyer@example.com",
            }
            self.updates = []

        async def find_one(self, query, *args, **kwargs):
            if query.get("id") == "o1":
                return dict(self.order)
            return None

        async def update_one(self, query, update, **kwargs):
            self.updates.append((query, update))
            self.order.update(update.get("$set", {}))
            return DummyUpdateResult(1)

    orders = DummyOrdersCollection()
    server_module.db = types.SimpleNamespace(orders=orders)

    paid_calls = []

    async def fake_mark_order_paid(order_id, note_text=None):
        paid_calls.append((order_id, note_text))
        orders.order.update({"payment_status": "paid", "fulfillment_status": "processing"})
        return {"id": order_id, "payment_status": "paid", "fulfillment_status": "processing"}

    monkeypatch.setattr(server_module, "_mark_order_paid", fake_mark_order_paid)

    result = asyncio.run(server_module.admin_update_order("o1", payment_status="paid", _admin={"id": "admin"}))

    assert paid_calls == [("o1", None)]
    assert result["payment_status"] == "paid"

    with pytest.raises(Exception):
        asyncio.run(server_module.admin_update_order("o1", payment_status="paaid", _admin={"id": "admin"}))


def test_admin_update_order_restocks_when_payment_status_is_cancelled(server_module, monkeypatch):
    class DummyOrdersCollection:
        def __init__(self):
            self.order = {
                "id": "o1",
                "payment_status": "awaiting_crypto",
                "fulfillment_status": "pending",
                "email": "buyer@example.com",
                "items": [{"product_id": "p1", "variant_id": None, "qty": 2, "preorder": False}],
            }
            self.updates = []

        async def find_one(self, query, *args, **kwargs):
            if query.get("id") == "o1":
                return dict(self.order)
            return None

        async def update_one(self, query, update, **kwargs):
            self.updates.append((query, update))
            self.order.update(update.get("$set", {}))
            return DummyUpdateResult(1)

    orders = DummyOrdersCollection()
    server_module.db = types.SimpleNamespace(orders=orders)

    restocked = []

    async def fake_restock(order):
        restocked.append(order["id"])

    monkeypatch.setattr(server_module, "_restock_order_items", fake_restock)

    asyncio.run(server_module.admin_update_order("o1", payment_status="cancelled", _admin={"id": "admin"}))

    assert restocked == ["o1"]


def test_checkout_idempotency_blocks_parallel_duplicate_orders(server_module, monkeypatch):
    class DummyIdempotencyCollection:
        def __init__(self):
            self.docs = {}

        async def find_one(self, query, *args, **kwargs):
            return self.docs.get(query.get("_id"))

        async def insert_one(self, doc, **kwargs):
            key = doc.get("_id")
            if key in self.docs:
                raise DuplicateKeyError("duplicate")
            self.docs[key] = doc

        async def update_one(self, query, update, **kwargs):
            key = query.get("_id")
            self.docs[key].update(update.get("$set", {}))

    class DummyOrdersCollection:
        def __init__(self):
            self.inserted = []

        async def insert_one(self, doc, **kwargs):
            self.inserted.append(doc)

        async def delete_one(self, query, **kwargs):
            return None

    idempotency = DummyIdempotencyCollection()
    orders = DummyOrdersCollection()
    class DummyProductsCollection:
        async def update_one(self, query, update, **kwargs):
            return types.SimpleNamespace(modified_count=1)

    class DummyPaymentTransactionsCollection:
        async def insert_one(self, doc, **kwargs):
            return None

    server_module.db = types.SimpleNamespace(
        idempotency=idempotency,
        orders=orders,
        products=DummyProductsCollection(),
        payment_transactions=DummyPaymentTransactionsCollection(),
    )

    async def allow_rate_limit(*args, **kwargs):
        return None

    monkeypatch.setattr(server_module, "_rate_limit", allow_rate_limit)

    async def fake_resolve_user(request):
        return None

    monkeypatch.setattr(server_module, "_resolve_user", fake_resolve_user)
    async def fake_build_order_totals(items, coupon_code=None):
        return ([], 0.0, 0.0, 0.0, 0.0, 10.0, 0.0, None, False)

    monkeypatch.setattr(server_module, "_build_order_totals", fake_build_order_totals)

    async def fake_reserve(line_items):
        await asyncio.sleep(0.05)
        return [{"product_id": "p1", "qty": 1, "preorder": False}]

    monkeypatch.setattr(server_module, "_reserve_stock_atomic", fake_reserve)
    async def fake_nowpayments_create(order_id, total, pay_currency):
        return {"mock": True}

    monkeypatch.setattr(server_module, "_nowpayments_create", fake_nowpayments_create)
    async def fake_affiliate_attach(order_doc, request):
        return None

    monkeypatch.setattr(server_module, "affiliate_attach_to_order", fake_affiliate_attach)

    async def fake_send_order_confirmation(order):
        return None

    monkeypatch.setattr(server_module, "send_order_confirmation", fake_send_order_confirmation)

    class DummyRequest:
        def __init__(self):
            self.headers = {"Idempotency-Key": "same-key"}
            self.client = types.SimpleNamespace(host="127.0.0.1")
            self.cookies = {}

    payload = types.SimpleNamespace(
        items=[types.SimpleNamespace(product_id="p1", qty=1, preorder=False)],
        coupon_code=None,
        payment_method="nowpayments",
        pay_currency="btc",
        email="buyer@example.com",
        shipping=types.SimpleNamespace(model_dump=lambda: {}),
        accept_terms=True,
        confirm_age=True,
        confirm_research_use=True,
    )

    requests = [DummyRequest(), DummyRequest()]

    async def run_checkout():
        return await asyncio.gather(
            server_module.checkout(payload, requests[0]),
            server_module.checkout(payload, requests[1]),
        )

    results = asyncio.run(run_checkout())

    assert len(orders.inserted) == 1
    assert len({r["id"] for r in results}) == 1
    assert "same-key" not in idempotency.docs
    assert all(document.get("expires_at") for document in idempotency.docs.values())


def test_unpaid_order_cannot_ship_or_refund(server_module):
    class Orders:
        async def find_one(self, query, *args, **kwargs):
            return {
                "id": "o-unpaid",
                "payment_status": "awaiting_etransfer",
                "fulfillment_status": "pending",
                "shipping_info": {},
                "total": 50,
            }

    server_module.db = types.SimpleNamespace(orders=Orders())
    shipping = server_module.ShippingInfoIn(carrier="Canada Post", tracking_number="TRACK123")

    with pytest.raises(server_module.HTTPException) as shipping_error:
        asyncio.run(server_module.admin_set_shipping_info("o-unpaid", shipping, {}))
    with pytest.raises(server_module.HTTPException) as refund_error:
        asyncio.run(server_module.admin_refund_order(
            "o-unpaid", server_module.RefundIn(amount=10), {"email": "admin@example.com"},
        ))

    assert shipping_error.value.status_code == 409
    assert refund_error.value.status_code == 409


def test_full_unshipped_refund_restocks_and_reverses(server_module, monkeypatch):
    order = {
        "id": "o-paid",
        "email": "buyer@example.com",
        "payment_status": "paid",
        "fulfillment_status": "processing",
        "total": 50.0,
        "refunded_amount": 0.0,
        "items": [{"product_id": "p1", "variant_id": None, "qty": 1}],
    }

    class Orders:
        async def find_one(self, query, *args, **kwargs):
            return dict(order)

        async def update_one(self, query, update, **kwargs):
            order.update(update.get("$set", {}))
            return DummyUpdateResult(1)

    class Referrals:
        async def update_many(self, *args, **kwargs):
            return DummyUpdateResult(1)

    server_module.db = types.SimpleNamespace(orders=Orders(), affiliate_referrals=Referrals())
    calls = []

    async def restock(refund_order):
        calls.append(("restock", refund_order["id"]))

    async def coupon(refund_order):
        calls.append(("coupon", refund_order["id"]))

    async def affiliate(order_id, full=True):
        calls.append(("affiliate", order_id))

    monkeypatch.setattr(server_module, "_restock_order_items", restock)
    monkeypatch.setattr(server_module, "_decrement_coupon_usage", coupon)
    monkeypatch.setattr(server_module, "affiliate_on_order_reversed", affiliate)

    result = asyncio.run(server_module.admin_refund_order(
        "o-paid", server_module.RefundIn(amount=50), {"email": "admin@example.com"},
    ))

    assert result["payment_status"] == "refunded"
    assert calls == [("restock", "o-paid"), ("coupon", "o-paid"), ("affiliate", "o-paid")]


def test_me_sanitizes_internal_fields(server_module):
    user = {
        "id": "u1",
        "email": "user@example.com",
        "name": "User",
        "role": "user",
        "permissions": {"orders": "manage"},
        "passwordless": True,
        "password_hash": "secret",
        "token_version": 3,
    }

    result = asyncio.run(server_module.me(user))

    assert result["id"] == "u1"
    assert "permissions" not in result
    assert "passwordless" not in result
    assert "password_hash" not in result
