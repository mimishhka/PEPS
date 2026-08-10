"""NORDPEP API backend tests"""
import os
import time
import uuid
import pytest
import requests

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
    return r.json()["token"]


@pytest.fixture(scope="session")
def user_session(s):
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Testpass123!", "name": "Test User"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "id": data["id"]}


# ---------------- Meta ----------------
def test_meta(s):
    r = s.get(f"{BASE_URL}/api/meta")
    assert r.status_code == 200
    data = r.json()
    assert data["store"] == "NORDPEP"
    assert data["currency"] == "CAD"
    assert data["min_age"] == 19
    assert data["interac_email"] == "orders@nordpep.ca"
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
    r1 = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Pass12345!", "name": "Dup"})
    assert r1.status_code == 200
    body = r1.json()
    assert body["email"] == email
    assert "token" in body
    r2 = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Pass12345!", "name": "Dup"})
    assert r2.status_code == 409


def test_login_admin_and_wrong_password(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    bad = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "WrongPass!!"})
    assert bad.status_code == 401


def test_me_with_and_without_token(s, admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL
    # Without token (use a fresh session to avoid cookie carryover)
    bare = requests.Session()
    r2 = bare.get(f"{BASE_URL}/api/auth/me")
    assert r2.status_code == 401


# ---------------- Checkout ----------------
def _get_first_product_id():
    r = requests.get(f"{BASE_URL}/api/products")
    return r.json()[0]["id"]


def test_checkout_interac_qc(user_session):
    pid = _get_first_product_id()
    payload = {
        "items": [{"product_id": pid, "qty": 2}],
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
    headers = {"Authorization": f"Bearer {user_session['token']}"}
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["payment_status"] == "awaiting_etransfer"
    assert order["payment_info"]["instructions"]["send_to"] == "orders@nordpep.ca"
    assert order["order_number"].startswith("NP-")
    # Taxes removed in iteration 2
    assert order["tax_rate"] == 0.0
    assert order["tax"] == 0.0
    assert order["shipping"] == 20.0
    # subtotal = price * 2, total = subtotal + 20 (no tax)
    assert abs(order["total"] - (order["subtotal"] + 20.0)) < 1e-6


def test_checkout_nowpayments_mock():
    pid = _get_first_product_id()
    payload = {
        "items": [{"product_id": pid, "qty": 1}],
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
    assert pinfo.get("mock") is True
    assert "pay_address" in pinfo


def test_checkout_fails_without_compliance():
    pid = _get_first_product_id()
    payload = {
        "items": [{"product_id": pid, "qty": 1}],
        "shipping": {"full_name": "X", "address1": "1", "city": "C", "province": "ON", "postal_code": "M5H2N2"},
        "payment_method": "interac",
        "accept_terms": True,
        "confirm_age": False,
        "confirm_research_use": True,
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 400


def test_orders_mine(user_session):
    headers = {"Authorization": f"Bearer {user_session['token']}"}
    r = requests.get(f"{BASE_URL}/api/orders/mine", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------- Admin ----------------
def test_admin_forbidden_for_user(user_session):
    headers = {"Authorization": f"Bearer {user_session['token']}"}
    r = requests.get(f"{BASE_URL}/api/admin/orders", headers=headers)
    assert r.status_code == 403


def test_admin_lists(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
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
    pid = _get_first_product_id()
    payload = {
        "items": [{"product_id": pid, "qty": 1}],
        "shipping": {"full_name": "U", "address1": "1", "city": "C", "province": "ON", "postal_code": "M5H2N2"},
        "payment_method": "interac",
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    headers = {"Authorization": f"Bearer {user_session['token']}"}
    o = requests.post(f"{BASE_URL}/api/checkout", json=payload, headers=headers).json()
    h = {"Authorization": f"Bearer {admin_token}"}
    r = requests.put(f"{BASE_URL}/api/admin/orders/{o['id']}/status", params={"payment_status": "paid"}, headers=h)
    assert r.status_code == 200
    assert r.json()["payment_status"] == "paid"


def test_admin_product_crud(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
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
    """QC + $64.99 product qty 1 → subtotal=64.99, tax=0, shipping=20, total=84.99."""
    p = _find_product_by_price(64.99)
    if not p:
        pytest.skip("No product priced at $64.99 in catalog")
    payload = {
        "items": [{"product_id": p["id"], "qty": 1}],
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
    assert o["subtotal"] == 64.99
    assert o["tax_rate"] == 0.0
    assert o["tax"] == 0.0
    assert o["shipping"] == 20.0
    assert o["total"] == 84.99


def test_iter2_guest_checkout_stores_email():
    """Guest (no auth) checkout with payload.email → order stored with that email."""
    pid = _get_first_product_id()
    guest_email = f"TEST_guest_{uuid.uuid4().hex[:6]}@example.com"
    payload = {
        "email": guest_email,
        "items": [{"product_id": pid, "qty": 1}],
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
    g = requests.get(f"{BASE_URL}/api/orders/{o['id']}")
    assert g.status_code == 200
    assert g.json()["email"] == guest_email.lower()


def test_iter2_any_province_returns_zero_tax():
    """Tax logic removed entirely — any province code returns tax=0.0."""
    pid = _get_first_product_id()
    for prov in ["QC", "ON", "BC", "AB", "NS"]:
        payload = {
            "items": [{"product_id": pid, "qty": 1}],
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
    pid = _get_first_product_id()
    test_email = f"TEST_logcheck_{uuid.uuid4().hex[:6]}@example.com"
    payload = {
        "email": test_email,
        "items": [{"product_id": pid, "qty": 1}],
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
    # Wait briefly for fire-and-forget email tasks
    time.sleep(3)
    logs = _read_backend_log_tail(800)
    # Customer Order received email (logged because RESEND_API_KEY empty)
    assert "[email-log] would send" in logs, "No [email-log] entries found in backend logs"
    assert test_email.lower() in logs.lower(), f"Customer email {test_email} not in log"
    assert "admin@nordpep.ca" in logs, "Admin email recipient not in log"
    assert "received" in logs.lower() or order_no in logs


def test_iter2_payment_received_email_on_status_paid(admin_token, user_session):
    """When admin marks payment_status=paid (was not paid) and order has email → payment-received email logged."""
    pid = _get_first_product_id()
    payload = {
        "items": [{"product_id": pid, "qty": 1}],
        "shipping": {
            "full_name": "PayTest", "address1": "1", "city": "Toronto",
            "province": "ON", "postal_code": "M5H2N2", "country": "CA",
        },
        "payment_method": "interac",
        "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
    }
    headers = {"Authorization": f"Bearer {user_session['token']}"}
    o = requests.post(f"{BASE_URL}/api/checkout", json=payload, headers=headers).json()
    user_email = user_session["email"].lower()
    # Now flip to paid via admin
    h = {"Authorization": f"Bearer {admin_token}"}
    time.sleep(1)
    r = requests.put(f"{BASE_URL}/api/admin/orders/{o['id']}/status",
                     params={"payment_status": "paid"}, headers=h)
    assert r.status_code == 200
    assert r.json()["payment_status"] == "paid"
    time.sleep(3)
    logs = _read_backend_log_tail(1200)
    # Should contain a "Payment received" log line for this user email
    assert "[email-log] would send" in logs
    assert "payment received" in logs.lower() or "Payment received" in logs, \
        "No 'Payment received' email log found after status flip"
    assert user_email in logs.lower(), f"User email {user_email} not in payment-received log"
