"""
Iteration 25 — Tests for GAP 1/2/3 in FIRONOVA order cancel & reopen flows.

Coverage:
  * PUT /api/admin/orders/{id}/status → cancel awaiting → restock + coupon decrement, no affiliate reversal
  * PUT ... → cancel paid → restock + coupon decrement + affiliate reversed
  * PUT ... via fulfillment_status → same side effects
  * Audit metadata: cancelled_at / cancelled_reason='admin_manual' / prev_payment_status
  * POST /api/admin/orders/{id}/reopen → 400 if not cancelled, 409 if insufficient stock (rollback),
    success re-decrements stock, restores coupon, restores prev_payment_status, clears audit fields
  * Reopen with mark_paid=True → order becomes paid
  * Idempotence: cancel → reopen → cancel → no double decrement of stock/coupon
  * _process_interac_deposit_emails → late payment detection on cancelled order (idempotent)
  * cancel_stale_unpaid_orders → auto-cancel path uses _cancel_order_side_effects(reverse_affiliate=False)

Design: sequential, no xdist parallelism (-n0 in run cmd). All fixtures seeded via motor,
teardown removes TEST_ prefixed docs.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient


# ---------------------------------------------------------------------------
def _load_env(path: str) -> dict:
    out = {}
    try:
        with open(path) as f:
            for ln in f:
                ln = ln.strip()
                if not ln or ln.startswith("#") or "=" not in ln:
                    continue
                k, v = ln.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return out


_BE = _load_env("/app/backend/.env")
_FE = _load_env("/app/frontend/.env")

BASE_URL = "http://localhost:8001"
PUBLIC_URL = (_FE.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = _BE.get("MONGO_URL") or os.environ.get("MONGO_URL")
DB_NAME = _BE.get("DB_NAME") or os.environ.get("DB_NAME")
ADMIN_EMAIL = _BE.get("ADMIN_EMAIL")
ADMIN_PASSWORD = _BE.get("ADMIN_PASSWORD")
assert MONGO_URL and DB_NAME, "MONGO_URL/DB_NAME missing"
assert ADMIN_EMAIL and ADMIN_PASSWORD

TEST_PREFIX = "TEST_iter25_"
PROD_ID = f"{TEST_PREFIX}prod_1"
VARIANT_ID = f"{TEST_PREFIX}v1"
COUPON_CODE = f"{TEST_PREFIX}CPN10"
CUSTOMER_EMAIL = f"{TEST_PREFIX}cust@example.com".lower()
AFFILIATE_ID = f"{TEST_PREFIX}aff_1"


def _mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------------------------------------------------------------------
async def _seed_product(initial_stock: int = 10):
    db = _mongo()
    await db.products.delete_many({"id": PROD_ID})
    await db.products.insert_one({
        "id": PROD_ID,
        "slug": f"{TEST_PREFIX}slug",
        "name_en": "Test Product",
        "name_fr": "Produit Test",
        "price": 50.0,
        "stock": initial_stock,
        "variants": [{
            "id": VARIANT_ID,
            "name": "5mg",
            "price": 50.0,
            "stock": initial_stock,
            "sku": "TESTSKU",
        }],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _seed_coupon(usage_limit=None, initial_used=1):
    db = _mongo()
    await db.coupons.delete_many({"code": COUPON_CODE})
    await db.coupons.insert_one({
        "id": f"{TEST_PREFIX}coupon_1",
        "code": COUPON_CODE,
        "discount_type": "percent",
        "discount_value": 10,
        "used_count": initial_used,
        "used_by": [{"email": CUSTOMER_EMAIL, "count": initial_used}],
        "usage_limit": usage_limit,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _seed_order(*, payment_status: str = "awaiting_etransfer",
                     qty: int = 2, with_coupon: bool = True,
                     with_affiliate: bool = False, coupon_counted: bool = True,
                     variant: bool = True) -> str:
    """Insert one order and return its id."""
    db = _mongo()
    order_id = f"{TEST_PREFIX}ord_{uuid.uuid4().hex[:8]}"
    order_number = f"FN-{uuid.uuid4().int % 1000000:06d}-{uuid.uuid4().hex[:6].upper()}"
    doc = {
        "id": order_id,
        "order_number": order_number,
        "email": CUSTOMER_EMAIL,
        "payment_status": payment_status,
        "fulfillment_status": "pending" if payment_status != "paid" else "processing",
        "total": 90.0,
        "items": [{
            "product_id": PROD_ID,
            "variant_id": VARIANT_ID if variant else "_default",
            "slug": f"{TEST_PREFIX}slug",
            "name_en": "Test Product",
            "qty": qty,
            "price": 50.0,
            "line_total": 50.0 * qty,
        }],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if with_coupon:
        doc["coupon"] = {"code": COUPON_CODE, "discount_value": 10, "discount_type": "percent"}
        doc["coupon_counted"] = coupon_counted
    if with_affiliate:
        doc["affiliate_id"] = AFFILIATE_ID
    if payment_status == "paid":
        doc["paid_at"] = datetime.now(timezone.utc).isoformat()
    await db.orders.insert_one(doc)
    if with_affiliate:
        # Also seed the referral row so we can check reversal
        await db.affiliate_referrals.delete_many({"order_id": order_id})
        await db.affiliate_referrals.insert_one({
            "id": f"{TEST_PREFIX}ref_{uuid.uuid4().hex[:6]}",
            "order_id": order_id,
            "affiliate_id": AFFILIATE_ID,
            "status": "pending" if payment_status == "paid" else "pending",
            "amount": 5.0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return order_id


async def _get_order(order_id):
    return await _mongo().orders.find_one({"id": order_id}, {"_id": 0})


async def _get_product_stock():
    p = await _mongo().products.find_one({"id": PROD_ID}, {"_id": 0})
    if not p:
        return None
    for v in p.get("variants", []):
        if v["id"] == VARIANT_ID:
            return v["stock"]
    return None


async def _get_coupon():
    return await _mongo().coupons.find_one({"code": COUPON_CODE}, {"_id": 0})


async def _cleanup_all():
    db = _mongo()
    await db.orders.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    await db.products.delete_many({"id": PROD_ID})
    await db.coupons.delete_many({"code": COUPON_CODE})
    await db.affiliate_referrals.delete_many({"affiliate_id": AFFILIATE_ID})


@pytest.fixture(scope="module", autouse=True)
def _seed_module():
    asyncio.get_event_loop().run_until_complete(_cleanup_all())
    yield
    asyncio.get_event_loop().run_until_complete(_cleanup_all())


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ===========================================================================
# GAP 1&2 — cancel awaiting_etransfer with coupon (no affiliate)
# ===========================================================================
def test_cancel_awaiting_restocks_and_decrements_coupon(h):
    _run(_seed_product(initial_stock=10))
    _run(_seed_coupon(initial_used=1))
    oid = _run(_seed_order(payment_status="awaiting_etransfer", qty=2))

    # Baseline
    assert _run(_get_product_stock()) == 10
    coupon_before = _run(_get_coupon())
    assert coupon_before["used_count"] == 1

    r = requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                     params={"payment_status": "cancelled"}, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["payment_status"] == "cancelled"
    assert data.get("cancelled_reason") == "admin_manual"
    assert data.get("cancelled_at")
    assert data.get("prev_payment_status") == "awaiting_etransfer"

    # Stock restored (10 + 2 = 12)
    assert _run(_get_product_stock()) == 12

    # Coupon decremented (both global and per-email)
    coupon_after = _run(_get_coupon())
    assert coupon_after["used_count"] == 0
    email_row = next((u for u in coupon_after.get("used_by", []) if u["email"] == CUSTOMER_EMAIL), None)
    assert email_row and email_row["count"] == 0

    # coupon_counted flag reset on order
    order = _run(_get_order(oid))
    assert order.get("coupon_counted") is False


# ===========================================================================
# GAP 2 — cancel PAID order → affiliate referral must be reversed
# ===========================================================================
def test_cancel_paid_reverses_affiliate_commission(h):
    _run(_seed_product(initial_stock=10))
    _run(_seed_coupon(initial_used=1))
    oid = _run(_seed_order(payment_status="paid", qty=1, with_affiliate=True))

    r = requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                     params={"payment_status": "cancelled"}, headers=h, timeout=15)
    assert r.status_code == 200, r.text

    # Restock + coupon decrement
    assert _run(_get_product_stock()) == 11
    c = _run(_get_coupon())
    assert c["used_count"] == 0

    # Affiliate referral reversed
    ref = _run(_mongo().affiliate_referrals.find_one({"order_id": oid}, {"_id": 0}))
    assert ref is not None
    assert ref["status"] == "reversed", f"expected reversed, got {ref['status']}"
    assert ref.get("reversed_at")

    # Audit
    order = _run(_get_order(oid))
    assert order["prev_payment_status"] == "paid"
    assert order["cancelled_reason"] == "admin_manual"


# ===========================================================================
# Cancel awaiting → NO commission touched (referral must remain unchanged)
# ===========================================================================
def test_cancel_awaiting_does_not_touch_referral(h):
    _run(_seed_product(initial_stock=5))
    _run(_seed_coupon(initial_used=1))
    oid = _run(_seed_order(payment_status="awaiting_etransfer", qty=1, with_affiliate=True))
    # Referral seeded with status pending
    r = requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                     params={"payment_status": "cancelled"}, headers=h, timeout=15)
    assert r.status_code == 200
    ref = _run(_mongo().affiliate_referrals.find_one({"order_id": oid}, {"_id": 0}))
    # Should still be pending (not reversed)
    assert ref is not None
    assert ref["status"] == "pending", f"unexpected: {ref['status']}"


# ===========================================================================
# GAP 1&2 bis — fulfillment_status transition to cancelled triggers side effects
# ===========================================================================
def test_cancel_via_fulfillment_status(h):
    _run(_seed_product(initial_stock=8))
    _run(_seed_coupon(initial_used=1))
    oid = _run(_seed_order(payment_status="awaiting_etransfer", qty=3))

    r = requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                     params={"fulfillment_status": "cancelled"}, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    # Stock restored
    assert _run(_get_product_stock()) == 8 + 3
    c = _run(_get_coupon())
    assert c["used_count"] == 0


# ===========================================================================
# GAP 3 — reopen 400 if not cancelled
# ===========================================================================
def test_reopen_rejects_non_cancelled(h):
    _run(_seed_product(initial_stock=5))
    _run(_seed_coupon(initial_used=1))
    oid = _run(_seed_order(payment_status="awaiting_etransfer", qty=1))
    r = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/reopen",
                      json={"mark_paid": False}, headers=h, timeout=15)
    assert r.status_code == 400, r.text


# ===========================================================================
# GAP 3 — reopen 409 if insufficient stock (rollback expected)
# ===========================================================================
def test_reopen_insufficient_stock_returns_409_and_rolls_back(h):
    _run(_seed_product(initial_stock=10))
    _run(_seed_coupon(initial_used=1))
    oid = _run(_seed_order(payment_status="awaiting_etransfer", qty=3))
    # Cancel first: stock goes to 13
    r = requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                     params={"payment_status": "cancelled"}, headers=h, timeout=15)
    assert r.status_code == 200
    assert _run(_get_product_stock()) == 13

    # Force stock too low to reopen (needs 3, we set 2)
    _run(_mongo().products.update_one(
        {"id": PROD_ID, "variants.id": VARIANT_ID},
        {"$set": {"variants.$.stock": 2}}))

    r2 = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/reopen",
                       json={"mark_paid": False}, headers=h, timeout=15)
    assert r2.status_code == 409, r2.text
    # Stock should still be 2 (rollback complete — no partial reservation)
    assert _run(_get_product_stock()) == 2


# ===========================================================================
# GAP 3 — full reopen happy path
# ===========================================================================
def test_reopen_happy_path_restores_state(h):
    _run(_seed_product(initial_stock=10))
    _run(_seed_coupon(initial_used=1))
    oid = _run(_seed_order(payment_status="awaiting_etransfer", qty=2))

    # cancel
    requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                 params={"payment_status": "cancelled"}, headers=h, timeout=15)
    assert _run(_get_product_stock()) == 12
    assert _run(_get_coupon())["used_count"] == 0

    # reopen
    r = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/reopen",
                      json={"mark_paid": False, "note": "customer paid late"},
                      headers=h, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["payment_status"] == "awaiting_etransfer"
    assert data.get("reopened_at")
    assert data.get("late_payment_flagged") is False
    # audit fields cleared
    assert "cancelled_at" not in data or data.get("cancelled_at") in (None, "")
    assert "cancelled_reason" not in data or data.get("cancelled_reason") in (None, "")
    assert "prev_payment_status" not in data or data.get("prev_payment_status") in (None, "")

    # Stock re-decremented (12 - 2 = 10)
    assert _run(_get_product_stock()) == 10

    # Coupon re-incremented
    c = _run(_get_coupon())
    assert c["used_count"] == 1
    email_row = next((u for u in c.get("used_by", []) if u["email"] == CUSTOMER_EMAIL), None)
    assert email_row and email_row["count"] == 1

    # Audit note present
    notes = [n.get("text", "") for n in (data.get("notes") or [])]
    assert any("reopened by" in t.lower() for t in notes)
    assert any(ADMIN_EMAIL.lower() in t.lower() for t in notes)


# ===========================================================================
# GAP 3 bis — reopen mark_paid=True → order becomes paid
# ===========================================================================
def test_reopen_with_mark_paid_transitions_to_paid(h):
    _run(_seed_product(initial_stock=10))
    _run(_seed_coupon(initial_used=1))
    oid = _run(_seed_order(payment_status="awaiting_etransfer", qty=1))
    # Cancel
    requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                 params={"payment_status": "cancelled"}, headers=h, timeout=15)
    # Reopen with mark_paid
    r = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/reopen",
                      json={"mark_paid": True}, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["payment_status"] == "paid"
    assert data.get("paid_at")
    # coupon should stay counted (=1) after full cycle
    assert _run(_get_coupon())["used_count"] == 1


# ===========================================================================
# Idempotence — cancel → reopen → cancel should not double-adjust
# ===========================================================================
def test_cancel_reopen_cancel_idempotent(h):
    _run(_seed_product(initial_stock=10))
    _run(_seed_coupon(initial_used=1))
    oid = _run(_seed_order(payment_status="awaiting_etransfer", qty=2))

    # cancel 1
    requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                 params={"payment_status": "cancelled"}, headers=h, timeout=15)
    assert _run(_get_product_stock()) == 12
    assert _run(_get_coupon())["used_count"] == 0

    # reopen
    r = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/reopen",
                      json={"mark_paid": False}, headers=h, timeout=15)
    assert r.status_code == 200
    assert _run(_get_product_stock()) == 10
    assert _run(_get_coupon())["used_count"] == 1

    # cancel again
    r2 = requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                      params={"payment_status": "cancelled"}, headers=h, timeout=15)
    assert r2.status_code == 200
    # Final state = same as after first cancel (12, 0). No double decrement.
    assert _run(_get_product_stock()) == 12
    assert _run(_get_coupon())["used_count"] == 0

    # cancel a THIRD time → nothing should change
    r3 = requests.put(f"{BASE_URL}/api/admin/orders/{oid}/status",
                      params={"payment_status": "cancelled"}, headers=h, timeout=15)
    assert r3.status_code == 200
    assert _run(_get_product_stock()) == 12
    assert _run(_get_coupon())["used_count"] == 0


# ===========================================================================
# Regression — cancel_stale_unpaid_orders uses _cancel_order_side_effects
# ===========================================================================
def test_auto_cancel_uses_side_effects_helper():
    # Import server module for direct call
    sys.path.insert(0, "/app/backend")
    import server  # type: ignore

    _run(_seed_product(initial_stock=10))
    _run(_seed_coupon(initial_used=1))
    # Create an order older than TTL
    old = (datetime.now(timezone.utc) - timedelta(hours=server.UNPAID_ORDER_TTL_HOURS + 1)).isoformat()
    order_id = f"{TEST_PREFIX}ord_stale_{uuid.uuid4().hex[:6]}"
    _run(_mongo().orders.insert_one({
        "id": order_id,
        "order_number": f"FN-{uuid.uuid4().int % 1000000:06d}-{uuid.uuid4().hex[:6].upper()}",
        "email": CUSTOMER_EMAIL,
        "payment_status": "awaiting_etransfer",
        "fulfillment_status": "pending",
        "total": 100.0,
        "items": [{
            "product_id": PROD_ID, "variant_id": VARIANT_ID,
            "slug": "s", "name_en": "P", "qty": 4, "price": 25.0, "line_total": 100.0,
        }],
        "coupon": {"code": COUPON_CODE, "discount_type": "percent", "discount_value": 10},
        "coupon_counted": True,
        "created_at": old,
    }))

    count = _run(server.cancel_stale_unpaid_orders())
    assert count >= 1

    order = _run(_get_order(order_id))
    assert order["payment_status"] == "cancelled"
    assert order["cancelled_reason"] == "auto_unpaid_timeout"
    assert order["prev_payment_status"] == "awaiting_etransfer"
    assert order.get("cancelled_at")

    # stock restored (10 + 4)
    assert _run(_get_product_stock()) == 14
    # coupon decremented
    assert _run(_get_coupon())["used_count"] == 0


# ===========================================================================
# GAP 3 — Late payment detection via _process_interac_deposit_emails
# ===========================================================================
def test_late_payment_detection_idempotent(monkeypatch):
    sys.path.insert(0, "/app/backend")
    import server  # type: ignore

    _run(_seed_product(initial_stock=5))
    oid = _run(_seed_order(payment_status="cancelled", qty=1, with_coupon=False))
    order = _run(_get_order(oid))
    ref = order["order_number"]

    # Monkey-patch Graph helpers
    async def fake_token():
        return "fake-token"

    fake_msg = {
        "id": "msg-1",
        "from": {"emailAddress": {"address": "notify@payments.interac.ca"}},
        "subject": f"Interac e-Transfer: You received money. Ref: {ref}",
        "body": {"content": f"You have received a deposit for order {ref} amount $90.00."},
    }

    call_count = {"n": 0}

    async def fake_unread(_token):
        call_count["n"] += 1
        return [fake_msg]

    async def fake_mark_read(_token, _mid):
        return True

    monkeypatch.setattr(server, "_graph_access_token", fake_token)
    monkeypatch.setattr(server, "_graph_unread_messages", fake_unread)
    monkeypatch.setattr(server, "_graph_mark_read", fake_mark_read)

    # Call once
    processed = _run(server._process_interac_deposit_emails())
    assert processed >= 1

    o = _run(_get_order(oid))
    assert o.get("late_payment_flagged") is True
    assert o.get("late_payment_reference") == ref
    # Note must exist with the warning
    notes = [n["text"] for n in o.get("notes", [])]
    assert any("PAIEMENT TARDIF" in t for t in notes), f"notes={notes}"
    note_count_1 = sum(1 for t in notes if "PAIEMENT TARDIF" in t)
    assert note_count_1 == 1

    # Call again → idempotent (no second note)
    _run(server._process_interac_deposit_emails())
    o2 = _run(_get_order(oid))
    notes2 = [n["text"] for n in o2.get("notes", [])]
    note_count_2 = sum(1 for t in notes2 if "PAIEMENT TARDIF" in t)
    assert note_count_2 == 1, f"expected 1 warning note, got {note_count_2}"
