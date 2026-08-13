"""FIRONOVA iteration 3 — featured/preorder/COA, coupons, shipping zones, analytics,
CSV exports, invoice PDF, atomic confirm-payment.

Runs against the public REACT_APP_BACKEND_URL (no /api default), uses the seeded admin.
"""
import os
import io
import csv
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://peptide-ca.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin-pass")


# ----------------------- fixtures -----------------------
@pytest.fixture(scope="session")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def user_session():
    email = f"iter3_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "Pass12345!", "name": "Iter3 User"})
    assert r.status_code == 200, r.text
    j = r.json()
    return {"email": email, "token": j["token"], "id": j["id"], "headers": {"Authorization": f"Bearer {j['token']}"}}


def _first_product():
    return requests.get(f"{BASE_URL}/api/products").json()[0]


# ----------------------- featured products -----------------------
def test_products_featured_filter_returns_six():
    r_all = requests.get(f"{BASE_URL}/api/products")
    assert r_all.status_code == 200
    all_products = r_all.json()
    assert len(all_products) >= 12, f"expected >=12 products got {len(all_products)}"

    r = requests.get(f"{BASE_URL}/api/products", params={"featured": "true"})
    assert r.status_code == 200
    featured = r.json()
    assert 1 <= len(featured) <= 12
    # Spec says ~6 (seeded set is 6)
    assert len(featured) == 6, f"expected exactly 6 featured got {len(featured)}: {[p['slug'] for p in featured]}"
    for p in featured:
        assert p.get("featured") is True


# ----------------------- admin create product with new fields -----------------------
def test_admin_create_product_with_iter3_fields(admin_headers):
    slug = f"test-iter3-{uuid.uuid4().hex[:6]}"
    payload = {
        "slug": slug, "name_en": "TEST_Iter3", "name_fr": "TEST_Iter3",
        "category": "healing", "sequence": "AAA", "purity": "≥ 99%", "dosage_mg": 5.0,
        "description_en": "x", "description_fr": "y", "price_cad": 49.99,
        "stock": 25, "low_stock_threshold": 5, "image_url": "", "lab_tested": True, "active": True,
        "featured": True, "preorder_allowed": True,
        "coa_url": "https://example.com/coa.pdf", "coa_lot": "LOT-2026-01", "coa_date": "2026-01-15",
    }
    r = requests.post(f"{BASE_URL}/api/admin/products", json=payload, headers=admin_headers)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    # Verify GET persistence
    g = requests.get(f"{BASE_URL}/api/products/{slug}")
    assert g.status_code == 200
    p = g.json()
    assert p["featured"] is True
    assert p["preorder_allowed"] is True
    assert p["coa_url"] == "https://example.com/coa.pdf"
    assert p["coa_lot"] == "LOT-2026-01"
    assert p["coa_date"] == "2026-01-15"
    # cleanup
    requests.delete(f"{BASE_URL}/api/admin/products/{pid}", headers=admin_headers)


# ----------------------- preorder checkout -----------------------
def test_checkout_preorder_when_stock_zero(admin_headers, user_session):
    slug = f"test-preorder-{uuid.uuid4().hex[:6]}"
    payload = {
        "slug": slug, "name_en": "TEST_Preorder", "name_fr": "TEST_Preorder",
        "category": "healing", "sequence": "P", "purity": "≥ 99%", "dosage_mg": 5.0,
        "description_en": "p", "description_fr": "p", "price_cad": 50.0,
        "stock": 0, "low_stock_threshold": 5, "active": True,
        "featured": False, "preorder_allowed": True, "coa_url": "", "coa_lot": "", "coa_date": "",
    }
    pr = requests.post(f"{BASE_URL}/api/admin/products", json=payload, headers=admin_headers)
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]
    try:
        co = {
            "items": [{"product_id": pid, "qty": 1}],
            "shipping": {"full_name": "PO", "address1": "1", "city": "T",
                         "province": "ON", "postal_code": "M5H2N2", "country": "CA"},
            "payment_method": "interac",
            "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
        }
        r = requests.post(f"{BASE_URL}/api/checkout", json=co, headers=user_session["headers"])
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["items"][0]["preorder"] is True
        assert o["fulfillment_status"] == "preorder"
        # stock NOT decremented for preorder
        g = requests.get(f"{BASE_URL}/api/products/{slug}")
        assert g.json()["stock"] == 0
    finally:
        requests.delete(f"{BASE_URL}/api/admin/products/{pid}", headers=admin_headers)


def test_checkout_rejects_when_stock_zero_no_preorder(admin_headers, user_session):
    slug = f"test-nopre-{uuid.uuid4().hex[:6]}"
    payload = {
        "slug": slug, "name_en": "TEST_NoPre", "name_fr": "TEST_NoPre",
        "category": "healing", "sequence": "N", "purity": "≥ 99%", "dosage_mg": 5.0,
        "description_en": "n", "description_fr": "n", "price_cad": 30.0,
        "stock": 0, "active": True, "preorder_allowed": False, "featured": False,
    }
    pr = requests.post(f"{BASE_URL}/api/admin/products", json=payload, headers=admin_headers)
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]
    try:
        co = {
            "items": [{"product_id": pid, "qty": 1}],
            "shipping": {"full_name": "X", "address1": "1", "city": "T",
                         "province": "ON", "postal_code": "M5H2N2", "country": "CA"},
            "payment_method": "interac",
            "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
        }
        r = requests.post(f"{BASE_URL}/api/checkout", json=co, headers=user_session["headers"])
        assert r.status_code == 400
        assert "Insufficient stock" in r.text
    finally:
        requests.delete(f"{BASE_URL}/api/admin/products/{pid}", headers=admin_headers)


# ----------------------- coupons -----------------------
@pytest.fixture(scope="session")
def fironova10_coupon(admin_headers):
    code = "FIRONOVA10"
    # delete pre-existing if any (idempotency)
    existing = requests.get(f"{BASE_URL}/api/admin/coupons", headers=admin_headers).json()
    for c in existing:
        if c.get("code") == code:
            requests.delete(f"{BASE_URL}/api/admin/coupons/{c['id']}", headers=admin_headers)
    payload = {"code": code, "discount_type": "percent", "value": 10.0,
               "min_subtotal": 50.0, "usage_limit": None, "active": True, "expires_at": None}
    r = requests.post(f"{BASE_URL}/api/admin/coupons", json=payload, headers=admin_headers)
    assert r.status_code == 200, r.text
    yield r.json()
    requests.delete(f"{BASE_URL}/api/admin/coupons/{r.json()['id']}", headers=admin_headers)


def test_validate_coupon_valid(fironova10_coupon):
    r = requests.post(f"{BASE_URL}/api/coupons/validate",
                      params={"code": "FIRONOVA10", "subtotal": 100})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["discount_amount"] == 10.0
    assert j["code"] == "FIRONOVA10"


def test_validate_coupon_invalid(fironova10_coupon):
    r = requests.post(f"{BASE_URL}/api/coupons/validate",
                      params={"code": "NOPE_BAD_CODE", "subtotal": 100})
    assert r.status_code == 400


def test_checkout_applies_coupon(fironova10_coupon, user_session):
    # find a product priced so that subtotal >=50
    products = requests.get(f"{BASE_URL}/api/products").json()
    target = next((p for p in products if p["price_cad"] >= 60 and p.get("stock", 0) > 0), None)
    assert target, "Need a product priced >=60 with stock for coupon test"
    co = {
        "items": [{"product_id": target["id"], "qty": 1}],
        "shipping": {"full_name": "C", "address1": "1", "city": "T",
                     "province": "ON", "postal_code": "M5H2N2", "country": "CA"},
        "payment_method": "interac", "coupon_code": "FIRONOVA10",
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=co, headers=user_session["headers"])
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["discount"] > 0
    assert o["coupon"]["code"] == "FIRONOVA10"
    expected = round(o["subtotal"] - o["discount"] + 20.0, 2)
    assert abs(o["total"] - expected) < 1e-6


# ----------------------- confirm-payment + status auto-transition -----------------------
def _make_order(user_session):
    pid = _first_product()["id"]
    co = {
        "items": [{"product_id": pid, "qty": 1}],
        "shipping": {"full_name": "Z", "address1": "1", "city": "T",
                     "province": "ON", "postal_code": "M5H2N2", "country": "CA"},
        "payment_method": "interac",
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    return requests.post(f"{BASE_URL}/api/checkout", json=co, headers=user_session["headers"]).json()


def test_admin_confirm_payment_atomic(admin_headers, user_session):
    o = _make_order(user_session)
    r = requests.post(f"{BASE_URL}/api/admin/orders/{o['id']}/confirm-payment", headers=admin_headers)
    assert r.status_code == 200, r.text
    upd = r.json()
    assert upd["payment_status"] == "paid"
    assert upd["fulfillment_status"] == "processing"
    assert "paid_at" in upd


def test_admin_status_paid_auto_transitions_fulfillment(admin_headers, user_session):
    o = _make_order(user_session)
    assert o["fulfillment_status"] == "pending"
    r = requests.put(f"{BASE_URL}/api/admin/orders/{o['id']}/status",
                     params={"payment_status": "paid"}, headers=admin_headers)
    assert r.status_code == 200
    j = r.json()
    assert j["payment_status"] == "paid"
    assert j["fulfillment_status"] == "processing"


# ----------------------- notes + shipping + stock -----------------------
def test_admin_order_notes_and_shipping(admin_headers, user_session):
    o = _make_order(user_session)
    n = requests.post(f"{BASE_URL}/api/admin/orders/{o['id']}/notes",
                      json={"text": "Internal note TEST_"}, headers=admin_headers)
    assert n.status_code == 200, n.text
    notes = n.json()["notes"]
    assert any(x["text"] == "Internal note TEST_" and x["admin_email"] == ADMIN_EMAIL and "ts" in x for x in notes)

    s = requests.put(f"{BASE_URL}/api/admin/orders/{o['id']}/shipping",
                     json={"carrier": "Canada Post", "tracking_number": "CP123TEST"},
                     headers=admin_headers)
    assert s.status_code == 200, s.text
    sj = s.json()
    assert sj["shipping_info"]["tracking_number"] == "CP123TEST"
    assert sj["fulfillment_status"] == "shipped"


def test_admin_adjust_stock(admin_headers):
    p = _first_product()
    base = p["stock"]
    r1 = requests.put(f"{BASE_URL}/api/admin/products/{p['id']}/stock",
                      json={"delta": 5}, headers=admin_headers)
    assert r1.status_code == 200
    assert r1.json()["stock"] == base + 5
    r2 = requests.put(f"{BASE_URL}/api/admin/products/{p['id']}/stock",
                      json={"delta": -5}, headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["stock"] == base


# ----------------------- shipping zones & methods -----------------------
def test_shipping_zones_seeded(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/shipping/zones", headers=admin_headers)
    assert r.status_code == 200
    zones = r.json()
    names = [z["name"] for z in zones]
    assert "Canada" in names
    assert "International" in names
    for z in zones:
        assert "methods" in z


def test_shipping_zone_and_method_crud(admin_headers):
    z = requests.post(f"{BASE_URL}/api/admin/shipping/zones",
                      json={"name": "TEST_Zone", "countries": ["CA"], "provinces": []},
                      headers=admin_headers)
    assert z.status_code == 200, z.text
    zid = z.json()["id"]
    z2 = requests.put(f"{BASE_URL}/api/admin/shipping/zones/{zid}",
                      json={"name": "TEST_Zone_renamed", "countries": ["CA"], "provinces": ["QC"]},
                      headers=admin_headers)
    assert z2.status_code == 200
    assert z2.json()["name"] == "TEST_Zone_renamed"

    m = requests.post(f"{BASE_URL}/api/admin/shipping/methods",
                      json={"zone_id": zid, "name": "TEST_Method", "cost_cad": 15.0,
                            "eta_days": "2-3", "active": True},
                      headers=admin_headers)
    assert m.status_code == 200, m.text
    mid = m.json()["id"]
    m2 = requests.put(f"{BASE_URL}/api/admin/shipping/methods/{mid}",
                      json={"zone_id": zid, "name": "TEST_Method2", "cost_cad": 19.99,
                            "eta_days": "3-5", "active": True},
                      headers=admin_headers)
    assert m2.status_code == 200
    assert m2.json()["cost_cad"] == 19.99

    d1 = requests.delete(f"{BASE_URL}/api/admin/shipping/methods/{mid}", headers=admin_headers)
    assert d1.status_code == 200
    d2 = requests.delete(f"{BASE_URL}/api/admin/shipping/zones/{zid}", headers=admin_headers)
    assert d2.status_code == 200


# ----------------------- analytics -----------------------
def test_admin_analytics(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/analytics", headers=admin_headers)
    assert r.status_code == 200
    j = r.json()
    assert "daily_revenue" in j and isinstance(j["daily_revenue"], list)
    assert "top_products" in j and isinstance(j["top_products"], list)
    assert "recent_orders" in j and isinstance(j["recent_orders"], list)
    for d in j["daily_revenue"]:
        assert "date" in d and "revenue" in d and "orders" in d


# ----------------------- CSV exports -----------------------
def test_admin_orders_csv(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/orders.csv", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "").lower()
    reader = csv.reader(io.StringIO(r.text))
    headers = next(reader)
    for col in ("order_number", "customer", "total_cad", "tracking_number"):
        assert col in headers, f"missing column {col} in {headers}"


def test_admin_products_csv(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/products.csv", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "").lower()
    reader = csv.reader(io.StringIO(r.text))
    headers = next(reader)
    for col in ("featured", "preorder_allowed", "coa_url"):
        assert col in headers, f"missing column {col} in {headers}"


# ----------------------- invoice PDF -----------------------
def test_order_invoice_pdf(user_session):
    o = _make_order(user_session)
    r = requests.get(f"{BASE_URL}/api/orders/{o['id']}/invoice.pdf",
                     headers=user_session["headers"])
    assert r.status_code == 200, r.text[:300]
    assert "application/pdf" in r.headers.get("content-type", "").lower()
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1024


# ----------------------- stats: low_stock field -----------------------
def test_admin_stats_has_low_stock(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/stats", headers=admin_headers)
    assert r.status_code == 200
    j = r.json()
    assert "low_stock" in j
    assert isinstance(j["low_stock"], int)
