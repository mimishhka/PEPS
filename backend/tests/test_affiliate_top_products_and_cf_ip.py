"""
Backend tests for iteration 24:
  1) /api/affiliate/top-products (auth + affiliate gate + shape + sort)
  2) _client_ip() Cloudflare rate limit fix (CF-Connecting-IP)

Tests use:
  - Public backend URL (frontend/.env REACT_APP_BACKEND_URL) for auth flows.
  - LOCAL backend URL (http://localhost:8001) for CF-Connecting-IP tests, since the
    external proxy strips CF-* headers coming from clients.
  - Direct MongoDB manipulation (motor) to seed a test affiliate + a paid order.
"""
import os
import re
import asyncio
import secrets
import uuid
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
def _load_env_file(path: str) -> dict:
    out = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return out


_FE_ENV = _load_env_file("/app/frontend/.env")
_BE_ENV = _load_env_file("/app/backend/.env")

PUBLIC_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
LOCAL_URL = os.environ.get("LOCAL_BACKEND_URL", PUBLIC_URL).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _BE_ENV.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _BE_ENV.get("DB_NAME")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL") or _BE_ENV.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or _BE_ENV.get("ADMIN_PASSWORD")

assert PUBLIC_URL, "REACT_APP_BACKEND_URL missing"
assert MONGO_URL and DB_NAME, "MONGO_URL/DB_NAME missing"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _login(base: str, email: str, password: str) -> str | None:
    session = requests.Session()
    r = session.post(
        f"{base}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    if r.status_code != 200:
        return None
    return session.cookies.get("access_token")


def _register_and_get_token(email: str, password: str, name: str) -> str | None:
    # Register (email verify off for pre-existing? Force email_verified after)
    r = requests.post(
        f"{PUBLIC_URL}/api/auth/register",
        json={"email": email, "password": password, "name": name},
        timeout=15,
    )
    # 200 or 409 both acceptable — we'll flip email_verified in DB below.
    return None  # we'll login after tweaking DB


async def _mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


# ---------------------------------------------------------------------------
# Fixtures — seed a test user + active affiliate + paid order
# ---------------------------------------------------------------------------
TEST_EMAIL = "test_affiliate_top@example.com"
TEST_PASSWORD = "TestPass!2026"
TEST_NAME = "TEST Affiliate"

TEST_NON_AFF_EMAIL = "test_non_affiliate_top@example.com"
TEST_NON_AFF_PASSWORD = "TestPass!2026"

TEST_AFF_CODE = "TESTTOPX"


@pytest.fixture(scope="module")
def seeded_ids():
    """Seed a user + active affiliate + 2 paid orders. Also seed a non-affiliate user.
    Returns dict with ids + tokens.
    """
    from bcrypt import hashpw, gensalt

    async def _seed():
        db = await _mongo()

        # Cleanup previous test data
        await db.users.delete_many({"email": {"$in": [TEST_EMAIL, TEST_NON_AFF_EMAIL]}})
        await db.affiliates.delete_many({"code": TEST_AFF_CODE})
        await db.orders.delete_many({"affiliate_id": "aff_test_top_1"})

        pwd_hash = hashpw(TEST_PASSWORD.encode(), gensalt()).decode()

        # Affiliate user
        user_id = f"usr_test_top_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({
            "id": user_id,
            "email": TEST_EMAIL,
            "name": TEST_NAME,
            "password_hash": pwd_hash,
            "role": "user",
            "token_version": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "email_verified": True,
        })

        # Non-affiliate user
        non_aff_hash = hashpw(TEST_NON_AFF_PASSWORD.encode(), gensalt()).decode()
        non_aff_id = f"usr_test_nonaff_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({
            "id": non_aff_id,
            "email": TEST_NON_AFF_EMAIL,
            "name": "TEST Non-Aff",
            "password_hash": non_aff_hash,
            "role": "user",
            "token_version": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "email_verified": True,
        })

        aff_id = "aff_test_top_1"
        await db.affiliates.insert_one({
            "id": aff_id,
            "user_id": user_id,
            "email": TEST_EMAIL,
            "code": TEST_AFF_CODE,
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "activated_at": datetime.now(timezone.utc).isoformat(),
            "payout_currency": "btc",
            "payout_address": "",
        })

        # Two paid orders attributed to this affiliate with 2 products
        await db.orders.insert_many([
            {
                "id": f"ord_test_{uuid.uuid4().hex[:8]}",
                "affiliate_id": aff_id,
                "payment_status": "paid",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "items": [
                    {
                        "product_id": "prod-A",
                        "slug": "product-a",
                        "name_fr": "Produit A",
                        "name_en": "Product A",
                        "image_url": "https://example.com/a.png",
                        "qty": 2,
                        "line_total": 100.0,
                    },
                    {
                        "product_id": "prod-B",
                        "slug": "product-b",
                        "name_fr": "Produit B",
                        "name_en": "Product B",
                        "image_url": "https://example.com/b.png",
                        "qty": 1,
                        "line_total": 40.0,
                    },
                ],
            },
            {
                "id": f"ord_test_{uuid.uuid4().hex[:8]}",
                "affiliate_id": aff_id,
                "payment_status": "paid",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "items": [
                    {
                        "product_id": "prod-A",
                        "slug": "product-a",
                        "name_fr": "Produit A",
                        "name_en": "Product A",
                        "image_url": "https://example.com/a.png",
                        "qty": 3,
                        "line_total": 150.0,
                    },
                ],
            },
        ])

        return {"user_id": user_id, "non_aff_id": non_aff_id, "aff_id": aff_id}

    ids = asyncio.run(_seed())

    # Login both users on the public URL
    aff_token = _login(PUBLIC_URL, TEST_EMAIL, TEST_PASSWORD)
    non_aff_token = _login(PUBLIC_URL, TEST_NON_AFF_EMAIL, TEST_NON_AFF_PASSWORD)
    ids["aff_token"] = aff_token
    ids["non_aff_token"] = non_aff_token

    yield ids

    # Teardown
    async def _cleanup():
        db = await _mongo()
        await db.users.delete_many({"email": {"$in": [TEST_EMAIL, TEST_NON_AFF_EMAIL]}})
        await db.affiliates.delete_many({"code": TEST_AFF_CODE})
        await db.orders.delete_many({"affiliate_id": "aff_test_top_1"})

    asyncio.run(_cleanup())


# ---------------------------------------------------------------------------
# /api/affiliate/top-products
# ---------------------------------------------------------------------------
class TestAffiliateTopProducts:
    def test_401_without_auth(self):
        r = requests.get(f"{PUBLIC_URL}/api/affiliate/top-products", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text[:200]}"

    def test_403_non_affiliate(self, seeded_ids):
        token = seeded_ids["non_aff_token"]
        assert token, "Failed to login non-affiliate test user"
        r = requests.get(
            f"{PUBLIC_URL}/api/affiliate/top-products",
            headers={"Cookie": f"access_token={token}"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_active_affiliate_success_shape_and_sort(self, seeded_ids):
        token = seeded_ids["aff_token"]
        assert token, "Failed to login affiliate test user"
        r = requests.get(
            f"{PUBLIC_URL}/api/affiliate/top-products",
            headers={"Cookie": f"access_token={token}"},
            timeout=15,
        )
        assert r.status_code == 200, f"got {r.status_code} {r.text[:200]}"
        data = r.json()
        assert isinstance(data, dict)
        assert set(["items", "orders_analyzed", "code"]).issubset(data.keys())
        assert data["code"] == TEST_AFF_CODE
        assert data["orders_analyzed"] == 2
        items = data["items"]
        assert isinstance(items, list) and len(items) == 2

        # Sorted by revenue desc: prod-A = 100+150 = 250, prod-B = 40
        assert items[0]["product_id"] == "prod-A"
        assert items[0]["qty"] == 5
        assert items[0]["revenue"] == 250.0
        assert items[0]["orders"] == 2
        assert items[1]["product_id"] == "prod-B"

        # share_url with ?ref=<code>
        for it in items:
            assert "share_url" in it
            assert f"ref={TEST_AFF_CODE}" in it["share_url"]
            assert it["slug"] in it["share_url"]
            # required fields
            for k in ["product_id", "slug", "name_fr", "name_en", "image_url", "qty", "revenue", "orders"]:
                assert k in it, f"missing key {k}"

    def test_limit_param_bounds(self, seeded_ids):
        token = seeded_ids["aff_token"]
        # limit=1 → single item
        r = requests.get(
            f"{PUBLIC_URL}/api/affiliate/top-products?limit=1",
            headers={"Cookie": f"access_token={token}"},
            timeout=15,
        )
        assert r.status_code == 200
        assert len(r.json()["items"]) == 1

        # limit=0 should be clamped to 1
        r2 = requests.get(
            f"{PUBLIC_URL}/api/affiliate/top-products?limit=0",
            headers={"Cookie": f"access_token={token}"},
            timeout=15,
        )
        assert r2.status_code == 200
        assert len(r2.json()["items"]) >= 1

        # limit=999 should be clamped ≤ 20 (we only have 2 seeded, so just verify no error)
        r3 = requests.get(
            f"{PUBLIC_URL}/api/affiliate/top-products?limit=999",
            headers={"Cookie": f"access_token={token}"},
            timeout=15,
        )
        assert r3.status_code == 200


# ---------------------------------------------------------------------------
# _client_ip() Cloudflare fix — via localhost since ext proxy strips CF-*
# ---------------------------------------------------------------------------
class TestClientIpCloudflare:
    """Tests that 5 failed logins on the same CF-Connecting-IP trigger 429,
    while a fresh CF-Connecting-IP still returns 401. Uses localhost."""

    @pytest.fixture(autouse=True)
    def _preflight(self):
        try:
            r = requests.get(f"{LOCAL_URL}/api/health", timeout=3)
            if r.status_code >= 500:
                pytest.skip("local backend unhealthy")
        except Exception:
            # Try a benign endpoint
            try:
                requests.get(f"{LOCAL_URL}/api/products?limit=1", timeout=3)
            except Exception:
                pytest.skip("localhost:8001 not reachable")

    def test_cf_ip_triggers_rate_limit_and_fresh_ip_still_401(self):
        # Use a unique email so throttle key = cf_ip:email is fresh
        unique = secrets.token_hex(4)
        bad_email = f"nobody_{unique}@example.com"
        cf_ip_hot = f"203.0.113.{secrets.randbelow(200)+1}"
        cf_ip_fresh = f"198.51.100.{secrets.randbelow(200)+1}"

        # Hit /auth/login 5 times with bad creds using the same CF-Connecting-IP
        statuses = []
        for _ in range(5):
            r = requests.post(
                f"{LOCAL_URL}/api/auth/login",
                json={"email": bad_email, "password": "wrong"},
                headers={"CF-Connecting-IP": cf_ip_hot},
                timeout=10,
            )
            statuses.append(r.status_code)
        assert all(s == 401 for s in statuses), f"expected all 401, got {statuses}"

        # 6th attempt on same CF-IP → 429
        r6 = requests.post(
            f"{LOCAL_URL}/api/auth/login",
            json={"email": bad_email, "password": "wrong"},
            headers={"CF-Connecting-IP": cf_ip_hot},
            timeout=10,
        )
        assert r6.status_code == 429, f"expected 429 on same CF-IP, got {r6.status_code} {r6.text[:200]}"

        # Fresh CF-Connecting-IP → back to 401
        r_fresh = requests.post(
            f"{LOCAL_URL}/api/auth/login",
            json={"email": bad_email, "password": "wrong"},
            headers={"CF-Connecting-IP": cf_ip_fresh},
            timeout=10,
        )
        assert r_fresh.status_code == 401, (
            f"expected 401 for fresh CF-IP, got {r_fresh.status_code} {r_fresh.text[:200]}"
        )

    def test_invalid_cf_ip_falls_back(self):
        """An invalid CF-Connecting-IP value should not crash — endpoint should still respond."""
        r = requests.post(
            f"{LOCAL_URL}/api/auth/login",
            json={"email": f"noone_{secrets.token_hex(3)}@example.com", "password": "wrong"},
            headers={"CF-Connecting-IP": "not-an-ip"},
            timeout=10,
        )
        assert r.status_code in (401, 429), f"unexpected {r.status_code}"
