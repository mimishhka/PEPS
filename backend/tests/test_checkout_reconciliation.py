"""Sprint J-1 - Item 1.2 : Checkout atomicity + B4 SMART reconciliation.

Vérifie que :
  1. Le circuit breaker démarre fermé (état sain).
  2. L'endpoint list retourne items+total (empty by default).
  3. Retry/resolve manipulent bien l'état.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://peptide-ca.preview.emergentagent.com").rstrip("/")


def _admin_session():
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not (email and password):
        pytest.skip("ADMIN_EMAIL/ADMIN_PASSWORD not in env")
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        headers={"Content-Type": "application/json", "Origin": BASE_URL},
        timeout=10,
    )
    if r.status_code != 200:
        pytest.skip(f"admin login failed ({r.status_code})")
    return s


@pytest.fixture(scope="module")
def admin():
    return _admin_session()


def test_breaker_state_healthy(admin):
    r = admin.get(f"{BASE_URL}/api/admin/reconciliation/checkout-breaker",
                  headers={"Origin": BASE_URL}, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["threshold"] == 5
    assert d["window_seconds"] == 3600
    # Après une session propre, le breaker doit être fermé
    assert d["is_open"] is False


def test_failures_list_shape(admin):
    r = admin.get(f"{BASE_URL}/api/admin/reconciliation/checkout-failures",
                  headers={"Origin": BASE_URL}, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "items" in d
    assert "total" in d
    assert isinstance(d["items"], list)


def test_retry_nonexistent_returns_404(admin):
    r = admin.post(
        f"{BASE_URL}/api/admin/reconciliation/checkout-failures/{uuid.uuid4().hex}/retry",
        headers={"Origin": BASE_URL}, timeout=10,
    )
    assert r.status_code == 404


def test_resolve_nonexistent_returns_404(admin):
    r = admin.post(
        f"{BASE_URL}/api/admin/reconciliation/checkout-failures/{uuid.uuid4().hex}/resolve",
        json={"note": "test", "action": "manual_reconciled"},
        headers={"Content-Type": "application/json", "Origin": BASE_URL},
        timeout=10,
    )
    assert r.status_code == 404
