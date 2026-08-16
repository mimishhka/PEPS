"""
Backend tests for Item 3.2 — Affiliate Minimum Payout Threshold
(AFFILIATE_PAYOUT_MIN_CAD, default 25.00 CAD).

Verified behaviors:
  1. Payout below threshold  → NO affiliate_payouts row created,
                               referrals stay in `approved` with payout_id=None,
                               deferral row inserted, email queued in outbox.
  2. Payout above threshold  → Normal affiliate_payouts row created,
                               referrals attached to payout_id.
  3. Idempotency             → Re-running the payout job for the same period
                               does NOT create a second deferral row nor a
                               second email (unique index on affiliate+period).
  4. Response shape          → `payouts_created`, `payouts_deferred`,
                               `threshold_cad` present in response.
"""
import os
import asyncio
import uuid
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient


def _load_env(path: str) -> dict:
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


_BE_ENV = _load_env("/app/backend/.env")
PUBLIC_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _BE_ENV.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _BE_ENV.get("DB_NAME")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL") or _BE_ENV.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or _BE_ENV.get("ADMIN_PASSWORD")
THRESHOLD = float(_BE_ENV.get("AFFILIATE_PAYOUT_MIN_CAD", "25.00"))

TEST_PERIOD = "2099-01"   # Isolated period so we don't collide with real data.
LOW_AFF_CODE = "TESTLOW"
HIGH_AFF_CODE = "TESTHIGH"


async def _mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


def _admin_session() -> requests.Session:
    s = requests.Session()
    r = s.post(f"{PUBLIC_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def seeded():
    """Seed two affiliates and their unpaid referrals :
      - LOW  : 12.00 CAD  (below the 25.00 threshold → must be deferred)
      - HIGH : 40.00 CAD  (above the 25.00 threshold → must produce a payout)
    """
    async def _seed():
        db = await _mongo()

        # Cleanup previous test data
        await db.affiliates.delete_many({"code": {"$in": [LOW_AFF_CODE, HIGH_AFF_CODE]}})
        await db.affiliate_referrals.delete_many({"affiliate_id": {"$in": ["aff_low_test", "aff_high_test"]}})
        await db.affiliate_payouts.delete_many({"affiliate_id": {"$in": ["aff_low_test", "aff_high_test"]}})
        await db.affiliate_payout_deferrals.delete_many({"affiliate_id": {"$in": ["aff_low_test", "aff_high_test"]}})
        await db.email_outbox.delete_many({"subject": {"$regex": "^FIRONOVA.*(reporté|deferred)"}})

        now_iso = datetime.now(timezone.utc).isoformat()
        # Below-threshold affiliate
        await db.affiliates.insert_one({
            "id": "aff_low_test", "code": LOW_AFF_CODE,
            "email": "low.threshold@example.com",
            "first_name": "Lea", "last_name": "Under",
            "name": "Lea Under",
            "status": "active",
            "payout_currency": "usdt",
            "payout_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0BEb0",
            "coupon_percent": 10,
            "preferred_lang": "fr",
            "created_at": now_iso,
        })
        # Above-threshold affiliate
        await db.affiliates.insert_one({
            "id": "aff_high_test", "code": HIGH_AFF_CODE,
            "email": "high.threshold@example.com",
            "first_name": "Hugo", "last_name": "Over",
            "name": "Hugo Over",
            "status": "active",
            "payout_currency": "usdt",
            "payout_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0BEb0",
            "coupon_percent": 10,
            "preferred_lang": "en",
            "created_at": now_iso,
        })
        # Two referrals for LOW affiliate — total 12.00 CAD (below 25)
        await db.affiliate_referrals.insert_many([
            {"id": str(uuid.uuid4()), "affiliate_id": "aff_low_test",
             "order_id": f"ord_low_{uuid.uuid4().hex[:8]}",
             "commission_amount": 7.50, "status": "approved",
             "payout_id": None, "created_at": now_iso},
            {"id": str(uuid.uuid4()), "affiliate_id": "aff_low_test",
             "order_id": f"ord_low_{uuid.uuid4().hex[:8]}",
             "commission_amount": 4.50, "status": "approved",
             "payout_id": None, "created_at": now_iso},
        ])
        # One referral for HIGH affiliate — 40.00 CAD (above 25)
        await db.affiliate_referrals.insert_many([
            {"id": str(uuid.uuid4()), "affiliate_id": "aff_high_test",
             "order_id": f"ord_high_{uuid.uuid4().hex[:8]}",
             "commission_amount": 40.00, "status": "approved",
             "payout_id": None, "created_at": now_iso},
        ])

    asyncio.run(_seed())
    yield
    # Cleanup after test module
    async def _clean():
        db = await _mongo()
        await db.affiliates.delete_many({"code": {"$in": [LOW_AFF_CODE, HIGH_AFF_CODE]}})
        await db.affiliate_referrals.delete_many({"affiliate_id": {"$in": ["aff_low_test", "aff_high_test"]}})
        await db.affiliate_payouts.delete_many({"affiliate_id": {"$in": ["aff_low_test", "aff_high_test"]}})
        await db.affiliate_payout_deferrals.delete_many({"affiliate_id": {"$in": ["aff_low_test", "aff_high_test"]}})
    asyncio.run(_clean())


def test_run_payouts_below_threshold_defers(seeded):
    """LOW affiliate (12$) is deferred. HIGH affiliate (40$) gets a payout.
    Response exposes payouts_created, payouts_deferred and threshold_cad."""
    session = _admin_session()
    r = session.post(f"{PUBLIC_URL}/api/admin/affiliates/payouts/run",
                     params={"period": TEST_PERIOD}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["period"] == TEST_PERIOD
    assert data["threshold_cad"] == THRESHOLD

    # Locate our two test affiliates in the detail payload.
    details_low = [d for d in data["detail"] if d.get("affiliate_id") == "aff_low_test"]
    details_high = [d for d in data["detail"] if d.get("affiliate_id") == "aff_high_test"]
    assert len(details_low) == 1, "LOW affiliate missing from detail"
    assert len(details_high) == 1, "HIGH affiliate missing from detail"

    # LOW → deferred=True, no payout_id
    low = details_low[0]
    assert low.get("deferred") is True
    assert low.get("payout_id") is None
    assert low.get("amount_cad") == 12.00
    assert low.get("notified") is True

    # HIGH → payout_id set, no deferred flag
    high = details_high[0]
    assert high.get("deferred") is not True
    assert high.get("payout_id"), "HIGH affiliate should have a payout_id"
    assert high.get("amount_cad") == 40.00


def test_below_threshold_side_effects(seeded):
    """DB side-effects for the LOW affiliate:
      - NO row in affiliate_payouts
      - Referrals stay in `approved` status with payout_id still None
      - One row in affiliate_payout_deferrals with period=TEST_PERIOD
      - One queued email in email_outbox targeting the affiliate's email
    """
    async def _check():
        db = await _mongo()
        # No affiliate_payouts row for LOW
        payouts_low = await db.affiliate_payouts.count_documents(
            {"affiliate_id": "aff_low_test", "period": TEST_PERIOD}
        )
        assert payouts_low == 0, "no payout must be created below threshold"

        # But HIGH must have a payout
        payouts_high = await db.affiliate_payouts.count_documents(
            {"affiliate_id": "aff_high_test", "period": TEST_PERIOD}
        )
        assert payouts_high == 1

        # LOW referrals remain approved with payout_id=None
        remaining = await db.affiliate_referrals.count_documents(
            {"affiliate_id": "aff_low_test", "status": "approved", "payout_id": None}
        )
        assert remaining == 2

        # Exactly one deferral row for LOW+TEST_PERIOD
        deferrals = await db.affiliate_payout_deferrals.count_documents(
            {"affiliate_id": "aff_low_test", "period": TEST_PERIOD}
        )
        assert deferrals == 1

        # Email queued in outbox for the deferral notification
        emails = await db.email_outbox.count_documents(
            {"to": "low.threshold@example.com"}
        )
        assert emails >= 1
    asyncio.run(_check())


def test_rerun_is_idempotent(seeded):
    """Second invocation for the same period must NOT create a second
    deferral row nor a second email (unique constraint enforces this)."""
    session = _admin_session()
    # Second run
    r = session.post(f"{PUBLIC_URL}/api/admin/affiliates/payouts/run",
                     params={"period": TEST_PERIOD}, timeout=30)
    assert r.status_code == 200
    data = r.json()

    # LOW is still deferred but this run reports notified=False (already notified before)
    low = next((d for d in data["detail"] if d.get("affiliate_id") == "aff_low_test"), None)
    assert low is not None
    assert low.get("deferred") is True
    assert low.get("notified") is False, "should not re-notify on second run"

    async def _check():
        db = await _mongo()
        deferrals = await db.affiliate_payout_deferrals.count_documents(
            {"affiliate_id": "aff_low_test", "period": TEST_PERIOD}
        )
        assert deferrals == 1, "deferral must remain unique per (affiliate, period)"
    asyncio.run(_check())
