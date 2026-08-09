"""NORDPEP iteration 9 — variant sale_price, coa_url, and pre-order (COA pending) pricing.

Coverage:
- GET /api/products/bpc-157-5mg exposes sale_price + coa_url per variant.
- POST /api/checkout (interac) with 5mg variant charges 49.99 (sale price), decrements stock,
  order NOT flagged as preorder.
- POST /api/checkout (interac) with 10mg variant (COA pending, preorder_enabled) charges 85.00,
  marks line_items[].preorder=True, order.has_preorder=True and fulfillment_status='preorder',
  and DOES NOT decrement stock despite stock > 0.
- Admin PUT /api/admin/products/{id} accepts variants including sale_price + coa_url and persists them.
- Cleanup: delete created orders, restore 5mg stock, restore admin edit.
"""
import os
import uuid
import copy
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env", "r") as f:
            for ln in f:
                if ln.strip().startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = ln.strip().split("=", 1)[1].strip().rstrip("/")
                    break
    except OSError:
        pass
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL not set; skipping integration suite", allow_module_level=True)

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "nordpep_db")

ADMIN_EMAIL = "admin@nordpep.ca"
ADMIN_PASSWORD = "NordpepAdmin2026!"

PRODUCT_SLUG = "bpc-157-5mg"

TEST_EMAIL = f"TEST_iter9_{uuid.uuid4().hex[:6]}@example.com"
CREATED_ORDERS = []  # list of (order_id, decremented_variant_id_or_None, qty)


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def product():
    r = requests.get(f"{BASE_URL}/api/products/{PRODUCT_SLUG}", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = s.cookies.get("access_token")
    assert tok, "admin login: no access_token cookie (auth cookie-only)"
    return tok


def _variant(product_obj, name):
    for v in product_obj["variants"]:
        if v["name"] == name:
            return v
    raise AssertionError(f"variant {name} not found")


def _checkout(product_id, variant_id, qty=1, payment_method="interac"):
    payload = {
        "email": TEST_EMAIL,
        "items": [{"product_id": product_id, "variant_id": variant_id, "qty": qty}],
        "shipping": {
            "full_name": "Iter9 Tester", "address1": "1 Test St", "city": "Montreal",
            "province": "QC", "postal_code": "H2X1Y4", "country": "CA",
        },
        "payment_method": payment_method,
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    return requests.post(f"{BASE_URL}/api/checkout", json=payload, timeout=30)


# ==================== Product schema exposes fields ====================

def test_product_variants_expose_sale_and_coa(product):
    try:
        v5 = _variant(product, "5.0mg")
        v10 = _variant(product, "10.0mg")
    except AssertionError as ex:
        pytest.skip(str(ex))
    # 5mg: sale + coa_url set, in stock, not preorder
    assert abs(float(v5["price"]) - 64.99) < 0.001
    assert abs(float(v5["sale_price"]) - 49.99) < 0.001
    assert v5.get("coa_url", "").startswith("http")
    assert int(v5["stock"]) > 0
    assert not v5.get("preorder_enabled")
    # 10mg: preorder w/ coa_pending, preorder_price 85, price 100
    assert abs(float(v10["price"]) - 100.0) < 0.001
    assert v10.get("sale_price") in (None, 0, 0.0)
    assert abs(float(v10["preorder_price"]) - 85.0) < 0.001
    assert v10.get("preorder_enabled") is True
    assert v10.get("badge_coa_pending") is True
    assert int(v10["stock"]) > 0  # still has stock but COA pending → preorder


# ==================== Checkout: sale price (5mg) ====================

def test_checkout_5mg_uses_sale_price_and_decrements(product, db):
    try:
        v = _variant(product, "5.0mg")
    except AssertionError as ex:
        pytest.skip(str(ex))
    product_id = product["id"]
    stock_before = int(v["stock"])

    r = _checkout(product_id, v["id"], qty=1, payment_method="interac")
    assert r.status_code == 200, r.text
    o = r.json()
    CREATED_ORDERS.append((o["id"], v["id"], 1))

    # Line item priced at 49.99
    li = o["items"][0]
    assert abs(float(li["price_cad"]) - 49.99) < 0.001, f"expected sale 49.99, got {li['price_cad']}"
    assert li["preorder"] is False
    # Subtotal reflects sale price
    assert abs(float(o["subtotal"]) - 49.99) < 0.001
    # Order NOT preorder
    assert o.get("has_preorder") is False
    assert o.get("fulfillment_status") in ("pending", None)

    # Stock decremented in DB
    doc = db.products.find_one({"id": product_id})
    stock_after = next(x for x in doc["variants"] if x["id"] == v["id"])["stock"]
    assert int(stock_after) == stock_before - 1, f"stock not decremented: {stock_before} → {stock_after}"


# ==================== Checkout: pre-order (10mg, COA pending, stock > 0) ====================

def test_checkout_10mg_is_preorder_no_stock_decrement(product, db):
    try:
        v = _variant(product, "10.0mg")
    except AssertionError as ex:
        pytest.skip(str(ex))
    product_id = product["id"]
    stock_before = int(v["stock"])
    assert stock_before > 0, "test premise: 10mg should still show stock > 0"

    r = _checkout(product_id, v["id"], qty=1, payment_method="interac")
    assert r.status_code == 200, f"checkout should succeed for preorder: {r.status_code} {r.text}"
    o = r.json()
    CREATED_ORDERS.append((o["id"], None, 1))  # no stock decremented

    li = o["items"][0]
    # Preorder price = 85.00 (not sale, not price 100)
    assert abs(float(li["price_cad"]) - 85.0) < 0.001, f"expected 85.00 preorder, got {li['price_cad']}"
    assert li["preorder"] is True, "line item should be flagged preorder"
    assert abs(float(o["subtotal"]) - 85.0) < 0.001
    assert o.get("has_preorder") is True, "order should be flagged has_preorder"
    assert o.get("fulfillment_status") == "preorder"

    # Stock NOT decremented (COA-pending preorder skips decrement even with stock > 0)
    doc = db.products.find_one({"id": product_id})
    stock_after = next(x for x in doc["variants"] if x["id"] == v["id"])["stock"]
    assert int(stock_after) == stock_before, f"preorder MUST NOT decrement stock: {stock_before} → {stock_after}"


# ==================== Admin PUT persists sale_price + coa_url ====================

def test_admin_update_persists_sale_and_coa(admin_token, db):
    # Fetch current product via public endpoint (no admin GET /products exists)
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/api/products/{PRODUCT_SLUG}", timeout=15)
    assert r.status_code == 200, r.text
    target = r.json()
    product_id = target["id"]

    original_variants = copy.deepcopy(target["variants"])

    # Modify: bump 5mg sale to 48.50 and change coa_url
    NEW_SALE = 48.50
    NEW_COA = "https://example.com/coa-bpc157-5mg-iter9.pdf"
    payload = copy.deepcopy(target)
    for k in ("id", "_id", "created_at"):
        payload.pop(k, None)
    for v in payload["variants"]:
        if v["name"] == "5.0mg":
            v["sale_price"] = NEW_SALE
            v["coa_url"] = NEW_COA

    put = requests.put(
        f"{BASE_URL}/api/admin/products/{product_id}",
        headers=headers,
        json=payload,
        timeout=15,
    )
    assert put.status_code == 200, f"admin update failed: {put.status_code} {put.text[:400]}"

    # Verify persistence via public GET
    g = requests.get(f"{BASE_URL}/api/products/{PRODUCT_SLUG}", timeout=15)
    assert g.status_code == 200
    v5 = next(x for x in g.json()["variants"] if x["name"] == "5.0mg")
    assert abs(float(v5["sale_price"]) - NEW_SALE) < 0.001, f"sale_price not persisted: {v5['sale_price']}"
    assert v5["coa_url"] == NEW_COA, f"coa_url not persisted: {v5['coa_url']}"

    # Restore original
    payload["variants"] = original_variants
    restore = requests.put(
        f"{BASE_URL}/api/admin/products/{product_id}",
        headers=headers,
        json=payload,
        timeout=15,
    )
    assert restore.status_code == 200, f"restore failed: {restore.text[:300]}"

    # sanity
    g2 = requests.get(f"{BASE_URL}/api/products/{PRODUCT_SLUG}", timeout=15).json()
    v5b = next(x for x in g2["variants"] if x["name"] == "5.0mg")
    assert abs(float(v5b["sale_price"]) - 49.99) < 0.001, "restore didn't put sale back to 49.99"
    assert v5b["coa_url"].startswith("http")


# ==================== Cleanup ====================

def test_zzz_cleanup(db):
    for order_id, variant_id, qty in CREATED_ORDERS:
        o = db.orders.find_one({"id": order_id})
        if o and variant_id and o.get("payment_status") != "paid":
            # non-preorder interac reserved stock — restore it
            db.products.update_one(
                {"variants.id": variant_id},
                {"$inc": {"variants.$.stock": qty}},
            )
        db.orders.delete_one({"id": order_id})
    for order_id, *_ in CREATED_ORDERS:
        assert db.orders.find_one({"id": order_id}) is None
