"""FIRONOVA tests for /api/auth/me fix — returns 200+null for guests, not 401."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://peptide-ca.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin-pass")


def test_auth_me_guest_no_token():
    """GET /api/auth/me without any token → 200 + null body."""
    r = requests.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    assert r.json() is None, f"Expected null body, got {r.text}"


def test_auth_me_guest_invalid_token():
    """GET /api/auth/me with invalid Bearer token → 200 + null body."""
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    assert r.json() is None, f"Expected null body, got {r.text}"


def test_auth_me_guest_malformed_jwt():
    """GET /api/auth/me with garbage token → 200 + null body."""
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer abc.def.ghi"})
    assert r.status_code == 200
    assert r.json() is None


def test_admin_login_and_me():
    """Login admin → /auth/me returns admin object with role=admin."""
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    # token maybe returned or set only as cookie
    token = data.get("access_token") or data.get("token")

    # Use cookie session
    me = s.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body is not None, "Expected user object, got null"
    assert body.get("email") == ADMIN_EMAIL
    assert body.get("role") == "admin"
    assert "id" in body

    # If token available, also test bearer header
    if token:
        r2 = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json().get("role") == "admin"


def test_admin_endpoint_requires_auth():
    """GET /api/admin/orders without token → 401 or 403."""
    r = requests.get(f"{BASE_URL}/api/admin/orders")
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_admin_endpoint_with_admin_session():
    """Login admin → GET /api/admin/orders should be 200 (or at least not 401/403)."""
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    r2 = s.get(f"{BASE_URL}/api/admin/orders")
    assert r2.status_code == 200, f"Admin should access orders. Got {r2.status_code}: {r2.text[:200]}"


def test_catalog_products_available():
    """GET /api/products should return >= 12 products."""
    r = requests.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data.get("products", []))
    assert len(items) >= 12, f"Expected >=12 products, got {len(items)}"
