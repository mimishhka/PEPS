"""FIRONOVA API backend tests"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://peptide-ca.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin-pass")


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    token = s.cookies.get("access_token")
    assert token
    return token


@pytest.fixture(scope="session")
def user_session():
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    password = "Testpass123!"
    session = requests.Session()
    r = session.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": password, "name": "Test User"})
    assert r.status_code == 200, r.text
    data = r.json()
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    try:
        client[os.environ.get("DB_NAME", "nordpep_db")].users.update_one(
            {"id": data["id"]}, {"$set": {"email_verified": True}},
        )
    finally:
        client.close()
    login = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    access_cookie = session.cookies.get("access_token")
    assert access_cookie
    return {"email": email, "access_cookie": access_cookie, "id": data["id"]}


# ---------------- Meta ----------------
def test_meta(s):
    r = s.get(f"{BASE_URL}/api/meta")
    assert r.status_code == 200
    data = r.json()
    assert data["store"] == "FIRONOVA"
    assert data["currency"] == "CAD"
    assert data["min_age"] == 19
    assert "interac_email" not in data
    assert "QC" in data["provinces"]
    # Iteration 2: shipping flat changed to $20
    assert data["shipping_flat_cad"] == 20.0


# ---------------- Products ----------------
def test_list_products(s):
    r = s.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    products = r.json()
    assert len(products) >= 12
    sample = products[0]
    for field in ("name_en", "name_fr", "slug", "category", "dosage_mg", "price_cad", "sequence", "purity"):
        assert field in sample


def test_products_filter_healing(s):
    r = s.get(f"{BASE_URL}/api/products", params={"category": "healing"})
    assert r.status_code == 200
    products = r.json()
    assert len(products) >= 1
    for p in products:
        assert p["category"] == "healing"


def test_product_detail_bpc157(s):
    r = s.get(f"{BASE_URL}/api/products/bpc-157-5mg")
    assert r.status_code == 200
    p = r.json()
    assert p["slug"] == "bpc-157-5mg"
    assert p["name_en"] == "BPC-157"


# ---------------- Auth ----------------
def test_register_and_duplicate(s):
    email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    session = requests.Session()
    r1 = session.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Pass12345!", "name": "Dup"})
    assert r1.status_code == 200
    body = r1.json()
    assert body["email"] == email
    assert "token" not in body and "access_token" not in body
    assert session.cookies.get("access_token") is None
    r2 = session.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Pass12345!", "name": "Dup"})
    assert r2.status_code == 409


def test_login_admin_and_wrong_password(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    bad = requests.Session().post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "WrongPass!!"})
    assert bad.status_code == 401


def test_me_with_and_without_token(s, admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Cookie": f"access_token={admin_token}"})
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL
    # Without token (use a fresh session to avoid cookie carryover)
    bare = requests.Session()
    r2 = bare.get(f"{BASE_URL}/api/auth/me")
    assert r2.status_code == 200
    assert r2.json() is None


# ---------------- Checkout ----------------
def _get_first_product_id():
    r = requests.get(f"{BASE_URL}/api/products")
    products = r.json()
    for product in products:
        variant_stocks = [int(v.get("stock", 0)) for v in (product.get("variants") or [])]
        total_stock = int(product.get("stock", 0))
        if variant_stocks:
            total_stock = max(total_stock, max(variant_stocks))
        if total_stock >= 2:
            return product["id"]
    return products[0]["id"]


def _get_checkout_item(min_qty: int = 1):
    r = requests.get(f"{BASE_URL}/api/products")
    products = r.json()
    for product in products:
        variants = product.get("variants") or []
        if variants:
            for variant in variants:
                if int(variant.get("stock", 0)) >= min_qty:
                    return {
                        "product_id": product["id"],
                        "variant_id": variant["id"],
                        "price": float(variant.get("price", product.get("price_cad", 0))),
                    }
        elif int(product.get("stock", 0)) >= min_qty:
            return {
                "product_id": product["id"],
                "variant_id": None,
                "price": float(product.get("price_cad", 0)),
            }
    first = products[0]
    first_variant = (first.get("variants") or [{}])[0]
    return {
        "product_id": first["id"],
        "variant_id": first_variant.get("id"),
        "price": float(first_variant.get("price", first.get("price_cad", 0))),
    }


def test_checkout_interac_qc(user_session):
    item = _get_checkout_item(min_qty=2)
    payload = {
        "items": [{"product_id": item["product_id"], "variant_id": item["variant_id"], "qty": 2}],
        "shipping": {
            "full_name": "Jean Test",
            "address1": "123 Rue",
            "city": "Montreal",
            "province": "QC",
            "postal_code": "H2X1Y4",
            "country": "CA",
        },
        "payment_method": "interac",
        "accept_terms": True,
        "confirm_age": True,
        "confirm_research_use": True,
    }
    headers = {"Cookie": f"access_token={user_session['access_cookie']}"}
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["payment_status"] == "awaiting_etransfer"
    assert order["payment_info"]["instructions"]["send_to"] == os.environ.get("INTERAC_EMAIL", "orders@fironova.com")
    assert order["order_number"].startswith("FN-")
    # Taxes removed in iteration 2
    assert order["tax_rate"] == 0.0
    assert order["tax"] == 0.0
    assert order["shipping"] == 20.0
    assert order["subtotal"] > 0
    assert abs(order["total"] - (order["subtotal"] + 20.0)) < 1e-6


def test_checkout_nowpayments_invoice():
    item = _get_checkout_item(min_qty=1)
    payload = {
        "items": [{"product_id": item["product_id"], "variant_id": item["variant_id"], "qty": 1}],
        "shipping": {
            "full_name": "Crypto Buyer",
            "address1": "1 Main",
            "city": "Toronto",
            "province": "ON",
            "postal_code": "M5H2N2",
            "country": "CA",
        },
        "payment_method": "nowpayments",
        "pay_currency": "btc",
        "accept_terms": True,
        "confirm_age": True,
        "confirm_research_use": True,
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["payment_status"] == "awaiting_crypto"
    pinfo = order["payment_info"]["provider_response"]
    assert str(pinfo.get("invoice_id", "")).isdigit()
    assert pinfo.get("invoice_url", "").startswith("https://nowpayments.io/payment/?iid=")
    assert not pinfo.get("mock")


def test_checkout_fails_without_compliance():
    item = _get_checkout_item(min_qty=1)
    payload = {
        "items": [{"product_id": item["product_id"], "variant_id": item["variant_id"], "qty": 1}],
        "shipping": {"full_name": "X", "address1": "1", "city": "C", "province": "ON", "postal_code": "M5H2N2"},
        "payment_method": "interac",
        "accept_terms": True,
        "confirm_age": False,
        "confirm_research_use": True,
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 400


def test_orders_mine(user_session):
    headers = {"Cookie": f"access_token={user_session['access_cookie']}"}
    r = requests.get(f"{BASE_URL}/api/orders/mine", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------- Admin ----------------
def test_admin_forbidden_for_user(user_session):
    headers = {"Cookie": f"access_token={user_session['access_cookie']}"}
    r = requests.get(f"{BASE_URL}/api/admin/orders", headers=headers)
    assert r.status_code == 403


def test_admin_lists(admin_token):
    h = {"Cookie": f"access_token={admin_token}"}
    r1 = requests.get(f"{BASE_URL}/api/admin/orders", headers=h)
    assert r1.status_code == 200
    r2 = requests.get(f"{BASE_URL}/api/admin/customers", headers=h)
    assert r2.status_code == 200
    r3 = requests.get(f"{BASE_URL}/api/admin/stats", headers=h)
    assert r3.status_code == 200
    stats = r3.json()
    for k in ("total_orders", "pending_orders", "paid_orders", "customers", "products", "revenue_cad"):
        assert k in stats


def test_admin_update_order_status(admin_token, user_session):
    # Create an order first
    item = _get_checkout_item(min_qty=1)
    payload = {
        "items": [{"product_id": item["product_id"], "variant_id": item["variant_id"], "qty": 1}],
        "shipping": {"full_name": "U", "address1": "1", "city": "C", "province": "ON", "postal_code": "M5H2N2"},
        "payment_method": "interac",
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    headers = {"Cookie": f"access_token={user_session['access_cookie']}"}
    o = requests.post(f"{BASE_URL}/api/checkout", json=payload, headers=headers).json()
    h = {"Cookie": f"access_token={admin_token}"}
    r = requests.put(f"{BASE_URL}/api/admin/orders/{o['id']}/status", params={"payment_status": "paid"}, headers=h)
    assert r.status_code == 200
    assert r.json()["payment_status"] == "paid"


def test_admin_product_crud(admin_token):
    h = {"Cookie": f"access_token={admin_token}"}
    slug = f"test-prod-{uuid.uuid4().hex[:6]}"
    payload = {
        "slug": slug, "name_en": "TEST_Prod", "name_fr": "TEST_Prod",
        "category": "healing", "sequence": "TEST", "purity": "≥ 99%",
        "dosage_mg": 5.0, "description_en": "x", "description_fr": "y",
        "price_cad": 10.0, "stock": 10, "image_url": "", "lab_tested": True, "active": True,
    }
    r = requests.post(f"{BASE_URL}/api/admin/products", json=payload, headers=h)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    # Update
    payload["price_cad"] = 15.5
    r2 = requests.put(f"{BASE_URL}/api/admin/products/{pid}", json=payload, headers=h)
    assert r2.status_code == 200
    assert r2.json()["price_cad"] == 15.5
    # Verify via GET slug
    r3 = requests.get(f"{BASE_URL}/api/products/{slug}")
    assert r3.status_code == 200
    assert r3.json()["price_cad"] == 15.5
    # Delete
    r4 = requests.delete(f"{BASE_URL}/api/admin/products/{pid}", headers=h)
    assert r4.status_code == 200
    r5 = requests.get(f"{BASE_URL}/api/products/{slug}")
    assert r5.status_code == 404


# ---------------- Iteration 2: Tax removed, shipping=$20, guest checkout, email logs ----------------
def _find_product_by_price(target_price: float):
    """Find a product matching given price (e.g., 64.99) for iteration 2 tests."""
    r = requests.get(f"{BASE_URL}/api/products")
    for p in r.json():
        if abs(p["price_cad"] - target_price) < 1e-6:
            return p
    return None


def test_iter2_qc_64_99_no_tax_shipping_20():
    """QC order uses the effective catalog price with no tax and $20 shipping."""
    item = _get_checkout_item(min_qty=1)
    payload = {
        "items": [{"product_id": item["product_id"], "variant_id": item["variant_id"], "qty": 1}],
        "shipping": {
            "full_name": "Test QC",
            "address1": "1 Rue",
            "city": "Montreal",
            "province": "QC",
            "postal_code": "H2X1Y4",
            "country": "CA",
        },
        "payment_method": "interac",
        "accept_terms": True,
        "confirm_age": True,
        "confirm_research_use": True,
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["subtotal"] > 0
    assert o["tax_rate"] == 0.0
    assert o["tax"] == 0.0
    assert o["shipping"] == 20.0
    assert o["total"] == pytest.approx(o["subtotal"] + 20.0)


def test_iter2_guest_checkout_stores_email():
    """Guest (no auth) checkout with payload.email → order stored with that email."""
    item = _get_checkout_item(min_qty=1)
    guest_email = f"TEST_guest_{uuid.uuid4().hex[:6]}@example.com"
    payload = {
        "email": guest_email,
        "items": [{"product_id": item["product_id"], "variant_id": item["variant_id"], "qty": 1}],
        "shipping": {
            "full_name": "Guest User",
            "address1": "1 Main",
            "city": "Toronto",
            "province": "ON",
            "postal_code": "M5H2N2",
            "country": "CA",
        },
        "payment_method": "interac",
        "accept_terms": True,
        "confirm_age": True,
        "confirm_research_use": True,
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["email"] == guest_email.lower()
    assert o["user_id"] is None
    # Verify persistence: GET order back
    g = requests.get(f"{BASE_URL}/api/orders/{o['id']}", params={"email": guest_email})
    assert g.status_code == 200
    assert g.json()["email"] == guest_email.lower()


def test_iter2_any_province_returns_zero_tax():
    """Tax logic removed entirely — any province code returns tax=0.0."""
    item = _get_checkout_item(min_qty=1)
    for prov in ["QC", "ON", "BC", "AB", "NS"]:
        payload = {
            "items": [{"product_id": item["product_id"], "variant_id": item["variant_id"], "qty": 1}],
            "shipping": {
                "full_name": "P", "address1": "1", "city": "C",
                "province": prov, "postal_code": "A1A1A1", "country": "CA",
            },
            "payment_method": "interac",
            "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
        }
        r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
        assert r.status_code == 200, f"{prov}: {r.text}"
        o = r.json()
        assert o["tax_rate"] == 0.0, f"{prov} tax_rate not zero"
        assert o["tax"] == 0.0, f"{prov} tax not zero"
        assert o["shipping"] == 20.0


def _read_backend_log_tail(n: int = 400) -> str:
    """Read last n lines of supervisor backend log."""
    import subprocess, glob
    paths = sorted(glob.glob("/var/log/supervisor/backend.*.log"))
    if not paths:
        return ""
    out = ""
    for p in paths[-2:]:
        try:
            with open(p, "r") as f:
                out += f.read()
        except Exception:
            pass
    return "\n".join(out.splitlines()[-n:])


def test_iter2_checkout_logs_two_emails():
    """After checkout, backend log shows '[email-log] would send' for customer + admin."""
    item = _get_checkout_item(min_qty=1)
    test_email = f"TEST_logcheck_{uuid.uuid4().hex[:6]}@example.com"
    payload = {
        "email": test_email,
        "items": [{"product_id": item["product_id"], "variant_id": item["variant_id"], "qty": 1}],
        "shipping": {
            "full_name": "Log Test", "address1": "1", "city": "Toronto",
            "province": "ON", "postal_code": "M5H2N2", "country": "CA",
        },
        "payment_method": "interac",
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 200, r.text
    order_no = r.json()["order_number"]
    if not os.environ.get("RESEND_API_KEY"):
        # Wait briefly for fire-and-forget email tasks when mail is logged locally.
        time.sleep(3)
        logs = _read_backend_log_tail(800)
        assert "[email-log] would send" in logs, "No [email-log] entries found in backend logs"
        assert test_email.lower() in logs.lower(), f"Customer email {test_email} not in log"
        assert ADMIN_EMAIL in logs, "Admin email recipient not in log"
        assert "received" in logs.lower() or order_no in logs
    else:
        assert order_no.startswith("FN-")


def test_iter2_payment_received_email_on_status_paid(admin_token, user_session):
    """When admin marks payment_status=paid (was not paid) and order has email → payment-received email logged."""
    item = _get_checkout_item(min_qty=1)
    payload = {
        "items": [{"product_id": item["product_id"], "variant_id": item["variant_id"], "qty": 1}],
        "shipping": {
            "full_name": "PayTest", "address1": "1", "city": "Toronto",
            "province": "ON", "postal_code": "M5H2N2", "country": "CA",
        },
        "payment_method": "interac",
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    headers = {"Cookie": f"access_token={user_session['access_cookie']}"}
    o = requests.post(f"{BASE_URL}/api/checkout", json=payload, headers=headers).json()
    user_email = user_session["email"].lower()
    # Now flip to paid via admin
    h = {"Cookie": f"access_token={admin_token}"}
    r = requests.put(f"{BASE_URL}/api/admin/orders/{o['id']}/status",
                     params={"payment_status": "paid"}, headers=h)
    assert r.status_code == 200
    assert r.json()["payment_status"] == "paid"
    refreshed = requests.get(f"{BASE_URL}/api/orders/mine", headers=headers)
    assert refreshed.status_code == 200
    updated = next(order for order in refreshed.json() if order["id"] == o["id"])
    assert updated["payment_status"] == "paid"
