"""Iteration 22 — Bonification modal admin affiliate.
Tests PUT /api/admin/affiliates/{id} with extended fields:
name, payout_address, payout_currency, coupon_percent (0-100), admin_notes.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://peptide-ca.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@nordpep.ca"
ADMIN_PASSWORD = "G7moffIe-CvzB5Mc"
DEMO_AFFILIATE_EMAIL = "demo.affilie@fironova.com"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
               timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def demo_affiliate_id(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/affiliates", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    assert isinstance(items, list) and items, f"No affiliates listed: {data}"
    target = next((a for a in items if a.get("email") == DEMO_AFFILIATE_EMAIL), None)
    assert target is not None, f"Demo affiliate not found. Emails: {[a.get('email') for a in items]}"
    return target["id"]


class TestAdminAffiliateExtendedUpdate:
    def test_extended_fields_accepted_and_persisted(self, admin_session, demo_affiliate_id):
        payload = {
            "payout_address": "test-crypto-addr-iter22@example.com",
            "payout_currency": "CAD",
            "coupon_percent": 15,
            "admin_notes": "Test note iter22",
        }
        r = admin_session.put(
            f"{BASE_URL}/api/admin/affiliates/{demo_affiliate_id}",
            json=payload, timeout=15
        )
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("payout_address") == payload["payout_address"]
        assert body.get("payout_currency") == payload["payout_currency"]
        assert float(body.get("coupon_percent")) == 15.0
        assert body.get("admin_notes") == payload["admin_notes"]

        # GET to verify persistence
        g = admin_session.get(
            f"{BASE_URL}/api/admin/affiliates/{demo_affiliate_id}", timeout=15
        )
        assert g.status_code == 200, g.text
        fresh = g.json()
        # Some responses may nest under 'affiliate'
        aff = fresh.get("affiliate", fresh)
        assert aff.get("payout_address") == payload["payout_address"]
        assert aff.get("payout_currency") == payload["payout_currency"]
        assert float(aff.get("coupon_percent")) == 15.0
        assert aff.get("admin_notes") == payload["admin_notes"]

    def test_name_update_accepted(self, admin_session, demo_affiliate_id):
        # First read current name
        g = admin_session.get(
            f"{BASE_URL}/api/admin/affiliates/{demo_affiliate_id}", timeout=15
        )
        original = g.json().get("affiliate", g.json()).get("name")

        new_name = "Demo Affilie Updated"
        r = admin_session.put(
            f"{BASE_URL}/api/admin/affiliates/{demo_affiliate_id}",
            json={"name": new_name}, timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("name") == new_name

        # Rollback
        if original:
            admin_session.put(
                f"{BASE_URL}/api/admin/affiliates/{demo_affiliate_id}",
                json={"name": original}, timeout=15,
            )

    def test_coupon_percent_out_of_range_rejected(self, admin_session, demo_affiliate_id):
        r = admin_session.put(
            f"{BASE_URL}/api/admin/affiliates/{demo_affiliate_id}",
            json={"coupon_percent": 150}, timeout=15,
        )
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_coupon_percent_negative_rejected(self, admin_session, demo_affiliate_id):
        r = admin_session.put(
            f"{BASE_URL}/api/admin/affiliates/{demo_affiliate_id}",
            json={"coupon_percent": -5}, timeout=15,
        )
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_rollback_extended_fields(self, admin_session, demo_affiliate_id):
        """Cleanup: revert admin_notes and coupon_percent to neutral values."""
        r = admin_session.put(
            f"{BASE_URL}/api/admin/affiliates/{demo_affiliate_id}",
            json={"admin_notes": "", "coupon_percent": 0}, timeout=15,
        )
        assert r.status_code == 200
