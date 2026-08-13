"""Backend tests: POST /api/admin/affiliates/bulk-invite"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")

pytestmark = pytest.mark.skipif(
    not (ADMIN_EMAIL and ADMIN_PASSWORD),
    reason="Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run admin tests",
)
BULK_URL = f"{BASE_URL}/api/admin/affiliates/bulk-invite"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def non_admin_token():
    # Create a regular user via signup
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "Str0ngP@ss!23", "name": "TestUser"},
                      timeout=30)
    if r.status_code not in (200, 201):
        # try login endpoint if signup unavailable
        pytest.skip(f"Cannot create non-admin user: {r.status_code} {r.text[:120]}")
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    if not tok:
        # try login
        rl = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": email, "password": "Str0ngP@ss!23"}, timeout=30)
        tok = rl.json().get("access_token")
    if not tok:
        pytest.skip("Cannot obtain non-admin token (email verification required)")
    return tok


def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestBulkInviteAuth:
    def test_no_auth_returns_401(self):
        r = requests.post(BULK_URL,
                          json={"rows": [{"email": "a@b.com", "name": "A"}]},
                          timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_non_admin_returns_401_or_403(self, non_admin_token):
        r = requests.post(BULK_URL, headers=_headers(non_admin_token),
                          json={"rows": [{"email": "a@b.com", "name": "A"}]},
                          timeout=30)
        assert r.status_code in (401, 403)

    def test_garbage_bearer_returns_401(self):
        r = requests.post(BULK_URL,
                          headers={"Authorization": "Bearer not-a-real-jwt",
                                   "Content-Type": "application/json"},
                          json={"rows": [{"email": "a@b.com", "name": "A"}]},
                          timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403 for bad token, got {r.status_code}"


class TestBulkInviteFlow:
    def test_happy_path_new_invites(self, admin_token):
        uniq = uuid.uuid4().hex[:6]
        rows = [
            {"email": f"TEST_bulk_{uniq}_1@example.com", "name": "User One"},
            {"email": f"TEST_bulk_{uniq}_2@example.com", "name": "User Two"},
        ]
        r = requests.post(BULK_URL, headers=_headers(admin_token),
                          json={"rows": rows, "lang": "fr", "commission_note": "test"},
                          timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["total"] == 2
        assert data["sent"] == 2
        assert data["skipped"] == []
        assert data["failed"] == []
        assert len(data["results"]) == 2
        code_re = re.compile(r"^FN[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$")
        codes = set()
        for row in data["results"]:
            assert code_re.match(row["code"]), f"bad code: {row['code']}"
            assert row["invite_link"].startswith("http")
            assert "token=" in row["invite_link"]
            codes.add(row["code"])
        assert len(codes) == 2, "codes must be unique"

    def test_duplicate_in_csv_marked_skipped(self, admin_token):
        uniq = uuid.uuid4().hex[:6]
        email = f"TEST_dup_{uniq}@example.com"
        rows = [
            {"email": email, "name": "First"},
            {"email": email, "name": "Second"},
        ]
        r = requests.post(BULK_URL, headers=_headers(admin_token),
                          json={"rows": rows}, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data["sent"] == 1
        assert len(data["skipped"]) == 1
        assert data["skipped"][0]["email"].lower() == email.lower()
        assert data["skipped"][0]["reason"] == "Duplicate in CSV"

    def test_invalid_email_goes_to_failed(self, admin_token):
        uniq = uuid.uuid4().hex[:6]
        rows = [
            {"email": "not-an-email", "name": "Bad"},
            {"email": f"TEST_ok_{uniq}@example.com", "name": "Good"},
        ]
        r = requests.post(BULK_URL, headers=_headers(admin_token),
                          json={"rows": rows}, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data["sent"] == 1
        assert len(data["failed"]) == 1
        assert data["failed"][0]["email"] == "not-an-email"
        assert "Invalid" in data["failed"][0]["error"] or "email" in data["failed"][0]["error"].lower()

    def test_reinvite_preserves_code(self, admin_token):
        uniq = uuid.uuid4().hex[:6]
        email = f"TEST_reinv_{uniq}@example.com"
        # First invite
        r1 = requests.post(BULK_URL, headers=_headers(admin_token),
                           json={"rows": [{"email": email, "name": "X"}]}, timeout=60)
        assert r1.status_code == 200
        code1 = r1.json()["results"][0]["code"]
        # Second invite (same email → status still 'invited')
        r2 = requests.post(BULK_URL, headers=_headers(admin_token),
                           json={"rows": [{"email": email, "name": "X"}]}, timeout=60)
        assert r2.status_code == 200
        data2 = r2.json()
        # Either in results (re-invited) or skipped — must not be 'active' since not activated
        if data2["results"]:
            assert data2["results"][0]["code"] == code1, "code must be preserved on re-invite"
        else:
            # skipped only when already active
            assert False, f"expected re-invite in results, got: {data2}"

    def test_already_active_is_skipped(self, admin_token):
        # We cannot easily activate an affiliate via API in test; skip if no active affiliates exist.
        r = requests.get(f"{BASE_URL}/api/admin/affiliates",
                         headers=_headers(admin_token), timeout=30)
        if r.status_code != 200:
            pytest.skip(f"cannot list affiliates: {r.status_code}")
        payload = r.json()
        aff_list = payload if isinstance(payload, list) else payload.get("affiliates", [])
        active = [a for a in aff_list if isinstance(a, dict) and a.get("status") == "active"]
        if not active:
            pytest.skip("no active affiliates in DB to test 'Already active' skip")
        email = active[0]["email"]
        r2 = requests.post(BULK_URL, headers=_headers(admin_token),
                           json={"rows": [{"email": email, "name": "X"}]}, timeout=60)
        assert r2.status_code == 200
        data = r2.json()
        assert any(s["email"].lower() == email.lower() and s["reason"] == "Already active"
                   for s in data["skipped"])

    def test_empty_rows_rejected(self, admin_token):
        r = requests.post(BULK_URL, headers=_headers(admin_token),
                          json={"rows": []}, timeout=30)
        assert r.status_code in (400, 422)
