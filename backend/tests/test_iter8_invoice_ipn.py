"""NORDPEP iteration 8 tests — NOWPayments INVOICE + widget + signed IPN webhook.

Coverage:
- POST /api/checkout (nowpayments) → payment_info.provider_response has invoice_id/invoice_url/price_amount/payment_status=waiting, NO pay_address
- POST /api/webhook/nowpayments:
    (a) missing/wrong signature → 401, order untouched
    (b) valid signature 'finished' → order payment_status=paid, fulfillment_status=processing,
        note added, payment_id persisted in provider_response
    (c) valid signature 'confirming' → provider_response.payment_status updated only (order still awaiting_crypto)
- GET /api/payments/crypto/status/{order_id} invoice-flow → 'awaiting_crypto'/'waiting' pre-IPN, 'paid' post-IPN
- REGRESSION: Interac checkout still works
- CLEANUP: delete created orders + restore variant stock
"""
import os
import re
import json
import hmac
import hashlib
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env", "r") as f:
            for ln in f:
                if ln.strip().startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = ln.strip().split("=", 1)[1].strip().strip('"').strip("'").rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "nordpep_db")

# Read IPN secret from backend .env (never printed)
IPN_SECRET = None
try:
    with open("/app/backend/.env", "r") as f:
        for ln in f:
            if ln.strip().startswith("NOWPAYMENTS_IPN_SECRET="):
                IPN_SECRET = ln.strip().split("=", 1)[1].strip().strip('"').strip("'")
                break
except Exception:
    pass
assert IPN_SECRET, "NOWPAYMENTS_IPN_SECRET missing"

CREATED_ORDERS = []  # (order_id, [(variant_id, qty)])
TEST_EMAIL = f"TEST_iter8_{uuid.uuid4().hex[:6]}@example.com"


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def products():
    r = requests.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200
    return r.json()


def _pick(products, min_stock=2, max_price=150):
    for p in products:
        for v in (p.get("variants") or []):
            if int(v.get("stock", 0)) >= min_stock and float(v.get("price", 0)) <= max_price:
                return p, v
    return None, None


def _checkout(product, variant, qty=1, payment_method="interac", pay_currency=None):
    payload = {
        "email": TEST_EMAIL,
        "items": [{"product_id": product["id"], "variant_id": variant["id"], "qty": qty}],
        "shipping": {
            "full_name": "Iter8 Tester", "address1": "1 Test St", "city": "Montreal",
            "province": "QC", "postal_code": "H2X1Y4", "country": "CA",
        },
        "payment_method": payment_method,
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    if pay_currency:
        payload["pay_currency"] = pay_currency
    return requests.post(f"{BASE_URL}/api/checkout", json=payload, timeout=30)


def _sign(payload: dict) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hmac.new(IPN_SECRET.encode(), body, hashlib.sha512).hexdigest()


# ==================== Invoice creation ====================

@pytest.fixture(scope="module")
def invoice_order(products):
    p, v = _pick(products)
    assert p and v
    r = _checkout(p, v, qty=1, payment_method="nowpayments")
    assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    CREATED_ORDERS.append((data["id"], [(v["id"], 1)]))
    return data


def test_invoice_shape(invoice_order):
    """Invoice flow: response contains invoice_id/invoice_url/price_amount, no pay_address."""
    pi = invoice_order.get("payment_info") or {}
    pr = pi.get("provider_response") or {}
    assert pr.get("invoice_id"), "invoice_id missing"
    # invoice_id may be int or numeric string
    iid = str(pr["invoice_id"])
    assert iid.isdigit(), f"invoice_id not numeric: {iid}"
    url = pr.get("invoice_url", "")
    assert url.startswith("https://nowpayments.io/payment/?iid="), f"bad invoice_url: {url}"
    assert iid in url
    assert abs(float(pr["price_amount"]) - float(invoice_order["total"])) < 0.01
    assert pr.get("payment_status") == "waiting"
    # Explicitly ensure no legacy pay_address field
    assert "pay_address" not in pr, "pay_address should not be in invoice flow"
    assert not pr.get("mock"), "should be live invoice mode"


# ==================== crypto/status ====================

def test_crypto_status_pre_ipn(invoice_order):
    """Pre-IPN: no payment_id → returns DB status without provider call."""
    r = requests.get(f"{BASE_URL}/api/payments/crypto/status/{invoice_order['id']}", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["payment_status"] == "awaiting_crypto"
    assert d["np_status"] == "waiting"


# ==================== IPN Webhook ====================

def test_ipn_missing_signature(invoice_order, db):
    """No x-nowpayments-sig header → 401, order unchanged."""
    payload = {"order_id": invoice_order["id"], "payment_status": "finished", "payment_id": 999999}
    r = requests.post(
        f"{BASE_URL}/api/webhook/nowpayments",
        data=json.dumps(payload, separators=(",", ":"), sort_keys=True),
        headers={"Content-Type": "application/json"},
        timeout=15,
    )
    assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"
    o = db.orders.find_one({"id": invoice_order["id"]})
    assert o["payment_status"] == "awaiting_crypto"


def test_ipn_bad_signature(invoice_order, db):
    """Wrong signature → 401, order unchanged."""
    payload = {"order_id": invoice_order["id"], "payment_status": "finished", "payment_id": 999999}
    r = requests.post(
        f"{BASE_URL}/api/webhook/nowpayments",
        data=json.dumps(payload, separators=(",", ":"), sort_keys=True),
        headers={"Content-Type": "application/json", "x-nowpayments-sig": "deadbeef" * 16},
        timeout=15,
    )
    assert r.status_code == 401
    o = db.orders.find_one({"id": invoice_order["id"]})
    assert o["payment_status"] == "awaiting_crypto"


def test_ipn_confirming_only_updates_status(invoice_order, db):
    """Valid sig with payment_status='confirming' → provider_response updated, order NOT paid."""
    payload = {
        "order_id": invoice_order["id"],
        "payment_status": "confirming",
        "payment_id": 987654321,
        "pay_currency": "btc",
    }
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    sig = hmac.new(IPN_SECRET.encode(), body.encode(), hashlib.sha512).hexdigest()
    r = requests.post(
        f"{BASE_URL}/api/webhook/nowpayments",
        data=body,
        headers={"Content-Type": "application/json", "x-nowpayments-sig": sig},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    o = db.orders.find_one({"id": invoice_order["id"]})
    assert o["payment_status"] == "awaiting_crypto", "should not be paid yet"
    pr = (o.get("payment_info") or {}).get("provider_response") or {}
    assert pr.get("payment_status") == "confirming"
    assert str(pr.get("payment_id")) == "987654321"


def test_ipn_finished_marks_paid(invoice_order, db):
    """Valid sig with payment_status='finished' → marks paid + processing + note."""
    payload = {
        "order_id": invoice_order["id"],
        "payment_status": "finished",
        "payment_id": 555555555,
        "pay_currency": "btc",
        "price_amount": float(invoice_order["total"]),
        "actually_paid": float(invoice_order["total"]),
    }
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    sig = hmac.new(IPN_SECRET.encode(), body.encode(), hashlib.sha512).hexdigest()
    r = requests.post(
        f"{BASE_URL}/api/webhook/nowpayments",
        data=body,
        headers={"Content-Type": "application/json", "x-nowpayments-sig": sig},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    o = db.orders.find_one({"id": invoice_order["id"]})
    assert o["payment_status"] == "paid"
    assert o["fulfillment_status"] == "processing"
    assert o.get("paid_at")
    pr = (o.get("payment_info") or {}).get("provider_response") or {}
    assert pr.get("payment_status") == "finished"
    assert str(pr.get("payment_id")) == "555555555"
    notes = o.get("notes") or []
    assert any("NOWPayments IPN" in (n.get("text") or "") for n in notes), "system note missing"


def test_crypto_status_after_finished_ipn(invoice_order):
    """After 'finished' IPN → crypto/status returns paid."""
    r = requests.get(f"{BASE_URL}/api/payments/crypto/status/{invoice_order['id']}", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["payment_status"] == "paid"


# ==================== Regressions ====================

def test_interac_regression(products, db):
    """Interac flow still works and decrements stock."""
    p, v = _pick(products)
    assert p and v
    before = int(next(x for x in db.products.find_one({"id": p["id"]})["variants"] if x["id"] == v["id"])["stock"])
    r = _checkout(p, v, qty=1, payment_method="interac")
    assert r.status_code == 200
    data = r.json()
    CREATED_ORDERS.append((data["id"], [(v["id"], 1)]))
    assert data["payment_status"] in ("awaiting_interac", "awaiting_etransfer")
    after = int(next(x for x in db.products.find_one({"id": p["id"]})["variants"] if x["id"] == v["id"])["stock"])
    assert after == before - 1


# ==================== Cleanup ====================

def test_zzz_cleanup(db):
    """Delete created test orders + restore variant stock."""
    for order_id, items in CREATED_ORDERS:
        o = db.orders.find_one({"id": order_id})
        if o and o.get("payment_status") != "paid":
            # Restore stock only if the order still holds reservation (interac/awaiting)
            for variant_id, qty in items:
                db.products.update_one(
                    {"variants.id": variant_id},
                    {"$inc": {"variants.$.stock": qty}},
                )
        db.orders.delete_one({"id": order_id})
    # sanity — orders removed
    for order_id, _ in CREATED_ORDERS:
        assert db.orders.find_one({"id": order_id}) is None
