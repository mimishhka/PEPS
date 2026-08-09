"""NORDPEP iteration 7 tests — NOWPayments LIVE integration + countdown backend support.

Coverage:
- POST /api/checkout with nowpayments/btc → real payment_id, real pay_address, no mock flag
- GET /api/payments/crypto/status/{order_id} for crypto order → 200 with np_status='waiting'
- GET /api/payments/crypto/status/{order_id} for non-crypto order → 404
- GET /api/payments/crypto/status/{order_id} for already-paid crypto order → 'paid' (no provider call)
- REGRESSION: Interac checkout works and decrements variant stock
- CLEANUP: delete created test orders and restore stock
"""
import os
import re
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "nordpep_db")

# Track created orders for cleanup
CREATED_ORDERS = []  # list of (order_id, items) tuples

TEST_EMAIL = f"TEST_iter7_{uuid.uuid4().hex[:6]}@example.com"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def products():
    r = requests.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200
    ps = r.json()
    assert len(ps) > 0
    return ps


def _pick(products, min_stock=2, max_price=150):
    for p in products:
        for v in (p.get("variants") or []):
            if int(v.get("stock", 0)) >= min_stock and float(v.get("price", 0)) <= max_price:
                return p, v
    return None, None


def _checkout(product, variant, qty=1, payment_method="interac", pay_currency=None, email=None):
    payload = {
        "email": email or TEST_EMAIL,
        "items": [{"product_id": product["id"], "variant_id": variant["id"], "qty": qty}],
        "shipping": {
            "full_name": "Iter7 Tester", "address1": "1 Test St", "city": "Montreal",
            "province": "QC", "postal_code": "H2X1Y4", "country": "CA",
        },
        "payment_method": payment_method,
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    if pay_currency:
        payload["pay_currency"] = pay_currency
    return requests.post(f"{BASE_URL}/api/checkout", json=payload, timeout=30)


# ==================== NOWPayments LIVE ====================

@pytest.fixture(scope="module")
def crypto_order(products):
    p, v = _pick(products)
    assert p and v, "No suitable product/variant"
    r = _checkout(p, v, qty=1, payment_method="nowpayments", pay_currency="btc")
    assert r.status_code == 200, f"Checkout failed: {r.status_code} {r.text}"
    data = r.json()
    order_id = data["id"]
    CREATED_ORDERS.append((order_id, [(v["id"], 1)]))
    return data


def test_nowpayments_live_creation_no_mock_flag(crypto_order):
    """POST /api/checkout with nowpayments/btc returns real payment (no mock)."""
    pi = crypto_order.get("payment_info") or {}
    pr = pi.get("provider_response") or {}

    assert pi.get("type") == "nowpayments", f"payment_info.type expected nowpayments, got {pi.get('type')}"
    assert "mock" not in pr or pr.get("mock") in (False, None), f"provider_response should have NO mock flag, got: {pr}"


@pytest.mark.xfail(reason="NOWPayments switched to the invoice flow in iter8: payment_id is replaced by invoice_id", strict=False)
def test_nowpayments_live_payment_id_numeric(crypto_order):
    pr = crypto_order["payment_info"]["provider_response"]
    pid = pr.get("payment_id")
    assert pid is not None and pid != "", "payment_id must be present"
    # Real NOWPayments payment ids are numeric strings
    assert re.match(r"^\d+$", str(pid)), f"payment_id should be numeric string, got: {pid}"


@pytest.mark.xfail(reason="NOWPayments switched to the invoice flow in iter8: pay_address is no longer returned", strict=False)
def test_nowpayments_live_pay_address_real_btc(crypto_order):
    pr = crypto_order["payment_info"]["provider_response"]
    addr = pr.get("pay_address")
    assert addr, "pay_address must be present"
    assert "TEST_ADDRESS" not in addr, f"Should be real BTC address, got mock: {addr}"
    # Real BTC addresses either start with '1', '3', or 'bc1'
    assert (addr.startswith("bc1") or addr.startswith("1") or addr.startswith("3")), \
        f"Should look like a real BTC address, got: {addr}"


def test_nowpayments_live_payment_status_waiting(crypto_order):
    pr = crypto_order["payment_info"]["provider_response"]
    assert pr.get("payment_status") == "waiting", f"Expected waiting, got: {pr.get('payment_status')}"


# ==================== Crypto status endpoint ====================

def test_crypto_status_returns_awaiting_and_waiting(crypto_order):
    """GET /api/payments/crypto/status/{order_id} for crypto order → 200 with np_status='waiting'."""
    oid = crypto_order["id"]
    r = requests.get(f"{BASE_URL}/api/payments/crypto/status/{oid}", timeout=30)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    assert body["payment_status"] == "awaiting_crypto", f"Got: {body}"
    assert body["np_status"] == "waiting", f"Got: {body}"


def test_crypto_status_for_non_crypto_order_returns_404(products, db):
    """Non-crypto order id should return 404 from crypto status endpoint."""
    p, v = _pick(products)
    r = _checkout(p, v, qty=1, payment_method="interac")
    assert r.status_code == 200
    oid = r.json()["id"]
    CREATED_ORDERS.append((oid, [(v["id"], 1)]))

    resp = requests.get(f"{BASE_URL}/api/payments/crypto/status/{oid}", timeout=15)
    assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"


def test_crypto_status_paid_order_short_circuits(crypto_order, db):
    """Already-paid crypto order returns 'paid' without calling provider (flip in mongo)."""
    # Create a NEW crypto order specifically for this test so we don't corrupt crypto_order fixture used above
    # Use the existing crypto_order (its status endpoint tests already ran).
    oid = crypto_order["id"]
    original = db.orders.find_one({"id": oid})
    assert original is not None
    original_status = original.get("payment_status")

    # Flip to paid
    db.orders.update_one({"id": oid}, {"$set": {"payment_status": "paid"}})
    try:
        r = requests.get(f"{BASE_URL}/api/payments/crypto/status/{oid}", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["payment_status"] == "paid", f"Got: {body}"
        assert body["np_status"] == "finished", f"Got: {body}"
    finally:
        # Restore original status so autocancel/cleanup works correctly
        db.orders.update_one({"id": oid}, {"$set": {"payment_status": original_status}})


# ==================== REGRESSION: Interac ====================

def test_interac_checkout_decrements_stock(products, db):
    """Regression: Interac flow decrements variant stock by qty."""
    p, v = _pick(products)
    variants = db.products.find_one({"id": p["id"]})["variants"]
    before = int(next(x for x in variants if x["id"] == v["id"])["stock"])

    r = _checkout(p, v, qty=1, payment_method="interac")
    assert r.status_code == 200
    oid = r.json()["id"]
    CREATED_ORDERS.append((oid, [(v["id"], 1)]))

    variants = db.products.find_one({"id": p["id"]})["variants"]
    after = int(next(x for x in variants if x["id"] == v["id"])["stock"])
    assert after == before - 1, f"Stock should decrement by 1: before={before} after={after}"


# ==================== Cleanup ====================

def test_cleanup_delete_orders_and_restore_stock(db):
    """Delete all test orders and restore variant stock."""
    for oid, items in CREATED_ORDERS:
        order = db.orders.find_one({"id": oid})
        if not order:
            continue
        # Restore stock (only if order wasn't cancelled/restocked already)
        if order.get("payment_status") not in ("cancelled",):
            for variant_id, qty in items:
                db.products.update_one(
                    {"variants.id": variant_id},
                    {"$inc": {"variants.$.stock": qty}},
                )
        db.orders.delete_one({"id": oid})
    # Verify all deleted
    remaining = [oid for oid, _ in CREATED_ORDERS if db.orders.find_one({"id": oid})]
    assert not remaining, f"Failed to delete orders: {remaining}"
