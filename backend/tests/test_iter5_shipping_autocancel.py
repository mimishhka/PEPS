"""FIRONOVA iteration 5 tests — free-shipping threshold + unpaid-order auto-cancel.

Coverage:
- Checkout shipping = $20 when subtotal < $200
- Checkout shipping = $0 when subtotal >= $200
- Auto-cancel watchdog: backdate an interac order, restart backend, verify:
    payment_status='cancelled', fulfillment_status='cancelled', system note,
    variant stock restocked.
"""
import os
import time
import uuid
import subprocess
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "fironova")


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def products():
    r = requests.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    ps = r.json()
    assert len(ps) > 0
    return ps


def _pick(products, want_variant_price_min=None, want_variant_price_max=None, min_stock=5):
    """Return (product, variant) matching price constraints."""
    for p in products:
        for v in (p.get("variants") or []):
            price = float(v.get("price", 0))
            stock = int(v.get("stock", 0))
            if stock < min_stock:
                continue
            if want_variant_price_min is not None and price < want_variant_price_min:
                continue
            if want_variant_price_max is not None and price > want_variant_price_max:
                continue
            return p, v
    return None, None


def _checkout(product, variant, qty, payment_method="interac", coupon=None):
    payload = {
        "items": [{"product_id": product["id"], "variant_id": variant["id"], "qty": qty}],
        "shipping": {"full_name": "Iter5 Test", "address1": "1 Test St", "city": "Toronto",
                     "province": "ON", "postal_code": "M5H2N2", "country": "CA"},
        "payment_method": payment_method,
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    if coupon:
        payload["coupon_code"] = coupon
    return requests.post(f"{BASE_URL}/api/checkout", json=payload)


# ================= Feature 1: free-shipping threshold =================

def test_shipping_flat_20_when_subtotal_under_200(products, db):
    # Pick product with price < $200 to make a small order
    p, v = _pick(products, want_variant_price_max=150, min_stock=2)
    assert p and v, "need a variant priced <=150 with stock"
    price = float(v["price"])
    qty = 1  # ensure subtotal < 200
    subtotal = round(price * qty, 2)
    assert subtotal < 200, f"expected subtotal < 200 got {subtotal}"

    r = _checkout(p, v, qty)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["subtotal"] == pytest.approx(subtotal, abs=0.01)
    assert o["shipping"] == 20.0, f"shipping should be 20 for subtotal {subtotal}, got {o['shipping']}"
    expected_total = round(subtotal + (o.get("tax") or 0) + 20.0 - (o.get("discount") or 0), 2)
    assert o["total"] == pytest.approx(expected_total, abs=0.01)

    # cleanup: remove order & restore stock
    db.orders.delete_one({"id": o["id"]})
    db.products.update_one({"id": p["id"], "variants.id": v["id"]},
                           {"$inc": {"variants.$.stock": qty}})


def test_shipping_free_when_subtotal_at_or_above_200(products, db):
    # Pick a variant that we can push subtotal >= 200 with qty
    p, v = _pick(products, want_variant_price_min=50, min_stock=4)
    assert p and v
    price = float(v["price"])
    qty = max(4, int(200 // price) + 1)
    subtotal = round(price * qty, 2)
    assert subtotal >= 200, f"expected subtotal >= 200 got {subtotal}"

    r = _checkout(p, v, qty)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["subtotal"] == pytest.approx(subtotal, abs=0.01)
    assert o["shipping"] == 0.0, f"shipping should be 0 for subtotal {subtotal}, got {o['shipping']}"

    # cleanup
    db.orders.delete_one({"id": o["id"]})
    db.products.update_one({"id": p["id"], "variants.id": v["id"]},
                           {"$inc": {"variants.$.stock": qty}})


# ================= Feature 2: auto-cancel unpaid orders =================

def test_auto_cancel_stale_unpaid_order_restocks(products, db):
    p, v = _pick(products, want_variant_price_max=150, min_stock=2)
    assert p and v
    qty = 1
    stock_before = int(v["stock"])

    r = _checkout(p, v, qty)
    assert r.status_code == 200, r.text
    order = r.json()
    order_id = order["id"]
    assert order["payment_status"] in ("awaiting_etransfer", "awaiting_crypto")

    # Confirm stock decremented
    doc = db.products.find_one({"id": p["id"]})
    v_now = next(vv for vv in doc["variants"] if vv["id"] == v["id"])
    assert int(v_now["stock"]) == stock_before - qty, "stock should be decremented after checkout"

    try:
        # Backdate created_at to 72h ago (ISO string, as stored)
        past = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()
        db.orders.update_one({"id": order_id}, {"$set": {"created_at": past}})

        # Restart backend so watchdog runs at startup
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, capture_output=True)

        # Wait for backend + startup task
        deadline = time.time() + 45
        cancelled = False
        while time.time() < deadline:
            try:
                hc = requests.get(f"{BASE_URL}/api/products", timeout=5)
                if hc.status_code == 200:
                    o2 = db.orders.find_one({"id": order_id})
                    if o2 and o2.get("payment_status") == "cancelled":
                        cancelled = True
                        break
            except Exception:
                pass
            time.sleep(2)

        assert cancelled, "order was not auto-cancelled within 45s of backend restart"

        o2 = db.orders.find_one({"id": order_id})
        assert o2["fulfillment_status"] == "cancelled"
        notes = o2.get("notes", [])
        assert any("Auto-cancelled: payment not received within 48h" in (n.get("text") or "") for n in notes), \
            f"missing system note; got: {[n.get('text') for n in notes]}"
        # Verify system-authored note
        sys_notes = [n for n in notes if "Auto-cancelled" in (n.get("text") or "")]
        assert any(n.get("author") == "system" for n in sys_notes)

        # Verify stock restocked to original level
        doc2 = db.products.find_one({"id": p["id"]})
        v_after = next(vv for vv in doc2["variants"] if vv["id"] == v["id"])
        assert int(v_after["stock"]) == stock_before, \
            f"stock not restocked: before={stock_before} after={v_after['stock']}"
    finally:
        # Cleanup: delete order. Stock already restocked by watchdog; if we bailed early, restore.
        db.orders.delete_one({"id": order_id})
        doc_final = db.products.find_one({"id": p["id"]})
        v_final = next(vv for vv in doc_final["variants"] if vv["id"] == v["id"])
        if int(v_final["stock"]) != stock_before:
            delta = stock_before - int(v_final["stock"])
            db.products.update_one({"id": p["id"], "variants.id": v["id"]},
                                   {"$inc": {"variants.$.stock": delta}})
