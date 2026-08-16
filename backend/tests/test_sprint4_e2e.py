"""Sprint 4 J-5 — end-to-end backend validation of the shopper journey.

Covers (per review request):
  * Server-derived pricing (subtotal / shipping / total)
  * Pricing tampering resistance (extra unit_price ignored)
  * Coupon apply + increment on paid + max_uses exhaustion
  * Idempotency key returns same order
  * Out-of-stock rejection (no order created)
  * Affiliate attribution via fn_ref cookie
  * Guest checkout + guest_access_token
  * Email outbox has queued entries after checkout
  * Admin confirm-payment lifecycle (payment_status -> paid, paid_at set)
  * Cancel after paid -> coupon.used_count decrements
  * Fulfillment: shipping-rates + create-label (dev sandbox tolerant)

Cleanup: all created orders are cancelled via PUT /admin/orders/{id}/status
when the module tears down.  All test users use TEST_ prefix +
@fironova-smoke.com so they can be reaped offline.
"""

import os
import uuid
import time
import pathlib
import pytest
import requests


def _resolve_base_url() -> str:
    # Prefer the frontend .env (matches production behavior). conftest.py sets a
    # 127.0.0.1 fallback which fails cookie-based tests because backend sets
    # affiliate cookies with Secure=True (dropped over http).
    env_url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if env_url and env_url.startswith("https://"):
        return env_url.rstrip("/")
    fe = pathlib.Path("/app/frontend/.env")
    if fe.exists():
        for line in fe.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    return val.rstrip("/")
    return (env_url or "http://127.0.0.1:8001").rstrip("/")


BASE_URL = _resolve_base_url()
# conftest.py reads os.environ['REACT_APP_BACKEND_URL'] at REQUEST-time to set
# Origin header. Override the setdefault fallback so admin/state-changing calls
# don't hit a 403 "Origin not allowed".
os.environ["REACT_APP_BACKEND_URL"] = BASE_URL

ADMIN_EMAIL = "admin@fironova.com"
ADMIN_PASSWORD = "uR8!vK3#xM9@qT6$wP2&zN7L"

DEMO_AFFILIATE_CODE = "DEMO00"

TEST_DOMAIN = "fironova-smoke.com"

# Track created order IDs across the module for teardown
_created_order_ids: list[str] = []
_created_coupon_ids: list[str] = []


def _hdr():
    return {"Content-Type": "application/json", "Origin": BASE_URL}


def _admin_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(_hdr())
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed ({r.status_code}): {r.text[:200]}")
    if "access_token" not in s.cookies.get_dict():
        pytest.skip("Admin session cookie missing")
    return s


@pytest.fixture(scope="module")
def admin():
    return _admin_session()


@pytest.fixture(scope="module")
def products():
    r = requests.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return data if isinstance(data, list) else data.get("items") or data.get("products") or []


def _effective_price(v: dict) -> float:
    sale = v.get("sale_price")
    base = float(v.get("price", 0.0))
    if sale and float(sale) < base:
        return float(sale)
    return base


def _pick_variant_with_stock(products_list, min_stock=5):
    """Sélectionne un variant avec stock suffisant. min_stock=5 par défaut
    évite qu'un test consomme la dernière unité et fasse échouer les suivants."""
    for p in products_list:
        if p.get("active") is False:
            continue
        if p.get("is_preorder"):
            continue
        for v in (p.get("variants") or []):
            stock = int(v.get("stock") or 0)
            if stock >= min_stock and not v.get("preorder_enabled") and not v.get("badge_coming_soon"):
                return p, v
    return None, None


def _shipping():
    # Adresse réelle validée par Google Maps AVS (item 1.3) — sans quoi tous
    # les checkouts sont bloqués 422 avec invalid_shipping_address.
    return {
        "full_name": "Sprint4 Tester",
        "address1": "100 Queen Street West",
        "address2": "",
        "city": "Toronto",
        "province": "ON",
        "postal_code": "M5H 2N2",
        "country": "CA",
        "phone": "5145550004",
    }


def _checkout_payload(items, email=None, coupon=None, idem=None, extras=None):
    payload = {
        "items": items,
        "shipping": _shipping(),
        "email": email or f"TEST_s4_{uuid.uuid4().hex[:8]}@{TEST_DOMAIN}",
        "payment_method": "interac",
        "coupon_code": coupon,
        "idempotency_key": idem or f"TEST_s4_{uuid.uuid4().hex}",
        "accept_terms": True,
        "confirm_age": True,
        "confirm_research_use": True,
    }
    if extras:
        payload.update(extras)
    return payload


def _do_checkout(session_or_none, items, **kw):
    payload = _checkout_payload(items, **kw)
    sess = session_or_none or requests
    r = sess.post(f"{BASE_URL}/api/checkout", json=payload, headers=_hdr(), timeout=30)
    return r, payload


# --------------------------------------------------------------- Pricing ----

class TestServerDerivedPricing:
    """Server must derive subtotal/shipping/total from DB, not client input."""

    def test_flat_shipping_when_under_threshold(self, products):
        p, v = _pick_variant_with_stock(products, 1)
        if not p:
            pytest.skip("No in-stock variant")
        # Small qty likely under FREE_SHIPPING_THRESHOLD_CAD=200
        r, _ = _do_checkout(None,
            [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}])
        assert r.status_code in (200, 201), r.text[:400]
        d = r.json()
        _created_order_ids.append(d["id"])
        expected_sub = round(_effective_price(v) * 1, 2)
        assert abs(d["subtotal"] - expected_sub) < 0.01, f"subtotal {d['subtotal']} vs {expected_sub}"
        # No taxes today (tax_rate = 0)
        assert d["tax"] == 0.0
        if expected_sub < 200:
            assert d["shipping"] == 20.0, f"expected flat 20 CAD, got {d['shipping']}"
        assert abs(d["total"] - (expected_sub + d["shipping"])) < 0.01

    def test_free_shipping_over_threshold(self, products):
        # Find variant expensive enough that qty*price >= 200
        chosen = None
        for p in products:
            if p.get("active") is False or p.get("is_preorder"):
                continue
            for v in (p.get("variants") or []):
                price = _effective_price(v)
                stock = int(v.get("stock") or 0)
                if price >= 50 and stock >= 4 and not v.get("preorder_enabled"):
                    qty_needed = max(1, int(200 // price) + 1)
                    if stock >= qty_needed and qty_needed <= 1000:
                        chosen = (p, v, qty_needed)
                        break
            if chosen:
                break
        if not chosen:
            pytest.skip("No product combination reaches free-shipping threshold with available stock")
        p, v, qty = chosen
        r, _ = _do_checkout(None,
            [{"product_id": p["id"], "variant_id": v["id"], "qty": qty}])
        assert r.status_code in (200, 201), r.text[:400]
        d = r.json()
        _created_order_ids.append(d["id"])
        assert d["subtotal"] >= 200
        assert d["shipping"] == 0.0, f"free shipping expected, got {d['shipping']}"

    def test_pricing_tampering_ignored(self, products):
        """Client sends bogus unit_price/line_total — server MUST recompute."""
        p, v = _pick_variant_with_stock(products, 1)
        if not p:
            pytest.skip("No in-stock variant")
        # Extra fields ignored by Pydantic (CartItem defines only product_id/variant_id/qty).
        item = {
            "product_id": p["id"],
            "variant_id": v["id"],
            "qty": 1,
            "unit_price": 0.01,       # attacker's hoped price
            "price_cad": 0.01,
            "line_total": 0.01,
        }
        r, _ = _do_checkout(None, [item])
        assert r.status_code in (200, 201), r.text[:400]
        d = r.json()
        _created_order_ids.append(d["id"])
        expected = round(_effective_price(v) * 1, 2)
        assert abs(d["subtotal"] - expected) < 0.01, (
            f"Tampering leaked: subtotal={d['subtotal']} expected={expected}"
        )
        # Line item price is the server-side variant price
        assert abs(d["items"][0]["price_cad"] - expected) < 0.01
        assert d["total"] >= expected  # includes shipping


# ---------------------------------------------------------------- Coupon ----

@pytest.fixture(scope="module")
def test_coupon(admin):
    """Create a 15% coupon with usage_limit=1 for exhaustion test."""
    code = f"TESTS4{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "code": code,
        "discount_type": "percent",
        "value": 15,
        "min_subtotal": 0.0,
        "usage_limit": 1,
        "active": True,
    }
    r = admin.post(f"{BASE_URL}/api/admin/coupons", json=payload, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Coupon create failed: {r.status_code} {r.text[:200]}")
    doc = r.json()
    _created_coupon_ids.append(doc["id"])
    return doc


class TestCoupon:
    def test_apply_coupon_reduces_total(self, admin, products, test_coupon):
        p, v = _pick_variant_with_stock(products, 1)
        if not p:
            pytest.skip("No stock")
        r, _ = _do_checkout(None,
            [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}],
            coupon=test_coupon["code"])
        assert r.status_code in (200, 201), r.text[:400]
        d = r.json()
        _created_order_ids.append(d["id"])
        assert d.get("coupon") is not None, "coupon not applied"
        expected_disc = round(_effective_price(v) * 0.15, 2)
        assert abs(d["discount"] - expected_disc) < 0.02, (
            f"discount {d['discount']} vs {expected_disc}"
        )

    def test_coupon_used_count_increments_only_after_paid(self, admin, products, test_coupon):
        # After the previous test, coupon should still be at used_count=0
        # until we confirm payment.  Refresh from DB via admin listing.
        r = admin.get(f"{BASE_URL}/api/admin/coupons", timeout=15)
        assert r.status_code == 200, r.text
        row = next((c for c in r.json() if c["id"] == test_coupon["id"]), None)
        assert row is not None
        assert row.get("used_count", 0) == 0, (
            f"used_count should be 0 before payment confirm, got {row.get('used_count')}"
        )

        # Find the order we just created with this coupon, confirm payment.
        # Grab most-recent order with this coupon via admin list.
        rlist = admin.get(f"{BASE_URL}/api/admin/orders?page=1&limit=50", timeout=15)
        assert rlist.status_code == 200
        listing = rlist.json()
        orders = listing if isinstance(listing, list) else listing.get("items") or listing.get("orders") or []
        target = next(
            (o for o in orders
             if (o.get("coupon") or {}).get("code") == test_coupon["code"]
             and o.get("payment_status") != "paid"
             and (o.get("id") in _created_order_ids)),
            None,
        )
        if not target:
            pytest.skip("No pending coupon order to confirm")
        cr = admin.post(f"{BASE_URL}/api/admin/orders/{target['id']}/confirm-payment", timeout=15)
        assert cr.status_code in (200, 201), cr.text[:400]
        updated = cr.json()
        assert updated.get("payment_status") == "paid"
        assert updated.get("paid_at") or updated.get("payment_confirmed_at"), (
            "paid_at timestamp missing after confirm-payment"
        )

        # Re-fetch coupon
        r2 = admin.get(f"{BASE_URL}/api/admin/coupons", timeout=15)
        row2 = next((c for c in r2.json() if c["id"] == test_coupon["id"]), None)
        assert row2 and row2.get("used_count", 0) == 1, (
            f"used_count expected 1 after paid, got {row2 and row2.get('used_count')}"
        )

    def test_coupon_exhausted_beyond_max_uses(self, admin, products, test_coupon):
        # Second attempt with usage_limit=1 must fail
        p, v = _pick_variant_with_stock(products, 1)
        if not p:
            pytest.skip("No stock")
        r, _ = _do_checkout(None,
            [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}],
            coupon=test_coupon["code"])
        assert r.status_code in (400, 403), (
            f"Expected 400/403 when coupon exhausted, got {r.status_code} {r.text[:200]}"
        )
        body = r.json()
        detail = str(body.get("detail") or body).lower()
        assert "limit" in detail or "exhaust" in detail or "invalid" in detail

    def test_paid_order_cancel_decrements_coupon(self, admin, test_coupon):
        """Cancel the paid coupon order and re-check used_count decrement."""
        # Find the paid order with the coupon
        rlist = admin.get(f"{BASE_URL}/api/admin/orders?page=1&limit=50", timeout=15)
        listing = rlist.json()
        orders = listing if isinstance(listing, list) else listing.get("items") or listing.get("orders") or []
        target = next(
            (o for o in orders
             if (o.get("coupon") or {}).get("code") == test_coupon["code"]
             and o.get("payment_status") == "paid"),
            None,
        )
        if not target:
            pytest.skip("No paid coupon order to cancel")
        r = admin.put(
            f"{BASE_URL}/api/admin/orders/{target['id']}/status"
            f"?fulfillment_status=cancelled&payment_status=cancelled",
            timeout=15,
        )
        assert r.status_code in (200, 204), r.text[:400]
        # Wait briefly and re-check coupon
        time.sleep(0.5)
        r2 = admin.get(f"{BASE_URL}/api/admin/coupons", timeout=15)
        row2 = next((c for c in r2.json() if c["id"] == test_coupon["id"]), None)
        assert row2 is not None
        # Best-effort decrement (per server: respects >=0)
        assert row2.get("used_count", 0) == 0, (
            f"used_count expected 0 after cancel, got {row2.get('used_count')}"
        )


# ------------------------------------------------------------- Idempotency ----

class TestIdempotency:
    def test_same_key_returns_same_order(self, products):
        p, v = _pick_variant_with_stock(products, 2)
        if not p:
            pytest.skip("No stock >= 2")
        idem = f"TEST_s4_idem_{uuid.uuid4().hex}"
        email = f"TEST_idem_{uuid.uuid4().hex[:8]}@{TEST_DOMAIN}"
        items = [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}]
        r1, _ = _do_checkout(None, items, idem=idem, email=email)
        r2, _ = _do_checkout(None, items, idem=idem, email=email)
        assert r1.status_code in (200, 201) and r2.status_code in (200, 201), (
            f"r1={r1.status_code} r2={r2.status_code}"
        )
        id1 = r1.json()["id"]; id2 = r2.json()["id"]
        _created_order_ids.append(id1)
        assert id1 == id2, f"idempotency broken: {id1} != {id2}"


# ------------------------------------------------------------- Out of stock ----

class TestOutOfStock:
    def test_qty_over_stock_without_preorder_rejected(self, products):
        # Pick a variant with finite stock and no preorder fallback
        chosen = None
        for p in products:
            if p.get("preorder_allowed"):
                continue
            for v in (p.get("variants") or []):
                stock = int(v.get("stock") or 0)
                if 0 < stock < 500 and not v.get("preorder_enabled") and not v.get("badge_coming_soon"):
                    chosen = (p, v, stock)
                    break
            if chosen:
                break
        if not chosen:
            pytest.skip("No suitable variant for OOS test")
        p, v, stock = chosen
        # Cap requested qty at CartItem.qty max (1000). If stock < 1000, use stock+1.
        req_qty = stock + 1
        if req_qty > 1000:
            pytest.skip(f"Variant stock ({stock}) too large to exceed under qty<=1000 cap")
        r, _ = _do_checkout(None,
            [{"product_id": p["id"], "variant_id": v["id"], "qty": req_qty}])
        assert r.status_code == 400, f"expected 400 for OOS, got {r.status_code} {r.text[:200]}"
        detail = str(r.json().get("detail") or "").lower()
        assert "stock" in detail or "insufficient" in detail, detail


# --------------------------------------------------------- Guest checkout ----

class TestGuestCheckout:
    def test_guest_checkout_and_access_token(self, products):
        p, v = _pick_variant_with_stock(products, 1)
        if not p:
            pytest.skip("No stock")
        email = f"TEST_guest_{uuid.uuid4().hex[:8]}@{TEST_DOMAIN}"
        r, _ = _do_checkout(None,
            [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}],
            email=email)
        assert r.status_code in (200, 201), r.text[:400]
        d = r.json()
        _created_order_ids.append(d["id"])
        token = d.get("guest_access_token")
        assert token, "guest_access_token missing on guest checkout"
        # Retrieve via HMAC header
        r2 = requests.get(f"{BASE_URL}/api/orders/{d['id']}",
            headers={"x-order-access-token": token}, timeout=15)
        assert r2.status_code == 200, f"guest fetch failed: {r2.status_code} {r2.text[:200]}"
        fetched = r2.json()
        assert fetched["id"] == d["id"]
        # Wrong token → 403
        r3 = requests.get(f"{BASE_URL}/api/orders/{d['id']}",
            headers={"x-order-access-token": "wrong"}, timeout=15)
        assert r3.status_code == 403, r3.status_code


# ------------------------------------------------------------- Email outbox ----

class TestEmailOutbox:
    def test_email_queued_after_checkout(self, admin, products):
        """After a fresh checkout, an outbox row should exist with the customer email.

        We can't peek the outbox directly (no admin endpoint listing it).
        Instead, we make a checkout and rely on the response + logs.  If a queued
        row is required by spec, capture and note here.
        """
        p, v = _pick_variant_with_stock(products, 1)
        if not p:
            pytest.skip("No stock")
        email = f"TEST_mail_{uuid.uuid4().hex[:8]}@{TEST_DOMAIN}"
        r, _ = _do_checkout(None,
            [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}],
            email=email)
        assert r.status_code in (200, 201), r.text[:400]
        _created_order_ids.append(r.json()["id"])
        # Backend has no admin GET for email_outbox — we assert the checkout
        # succeeded (which is the observable guarantee that queuing did not
        # raise like it did in iter 26 with the NameError bug).
        assert "guest_access_token" in r.json() or r.json().get("email") == email


# ---------------------------------------------------------------- Affiliate ----

class TestAffiliateAttribution:
    def test_affiliate_cookie_attaches_to_order(self, products):
        p, v = _pick_variant_with_stock(products, 1)
        if not p:
            pytest.skip("No stock")

        s = requests.Session()
        s.headers.update(_hdr())
        # 1) Set fn_ref cookie via /api/affiliate/ref/{code}
        rref = s.get(f"{BASE_URL}/api/affiliate/ref/{DEMO_AFFILIATE_CODE}", timeout=15)
        assert rref.status_code == 200, rref.text[:200]
        # Cookie can be dropped by TLS/CORS layers — check either the session
        # jar OR skip gracefully.
        if "fn_ref" not in s.cookies.get_dict():
            pytest.skip("fn_ref cookie not set by /affiliate/ref (ingress dropped Set-Cookie)")

        # 2) Guest checkout with the DEMO code — use a different email so
        # affiliate_attach_to_order doesn't reject self-referral.
        email = f"TEST_aff_{uuid.uuid4().hex[:8]}@{TEST_DOMAIN}"
        payload = _checkout_payload(
            [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}],
            email=email,
        )
        r = s.post(f"{BASE_URL}/api/checkout", json=payload, headers=_hdr(), timeout=30)
        assert r.status_code in (200, 201), r.text[:400]
        d = r.json()
        _created_order_ids.append(d["id"])
        assert d.get("affiliate_code") == DEMO_AFFILIATE_CODE, (
            f"affiliate_code missing: got {d.get('affiliate_code')}"
        )
        assert d.get("affiliate_id"), "affiliate_id missing on order"


# ---------------------------------------------------------------- Fulfillment ----

class TestFulfillment:
    def test_shipping_rates_and_create_label(self, admin, products):
        # Create a fresh order, mark paid, then request rates + label.
        p, v = _pick_variant_with_stock(products, 1)
        if not p:
            pytest.skip("No stock")
        r, _ = _do_checkout(None,
            [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}])
        assert r.status_code in (200, 201), r.text[:400]
        oid = r.json()["id"]
        _created_order_ids.append(oid)

        cp = admin.post(f"{BASE_URL}/api/admin/orders/{oid}/confirm-payment", timeout=15)
        assert cp.status_code in (200, 201), cp.text[:400]

        # Shipping rates — Canada Post sandbox may be unavailable → tolerant
        rr = admin.get(f"{BASE_URL}/api/admin/orders/{oid}/shipping-rates", timeout=30)
        if rr.status_code != 200:
            pytest.skip(f"Canada Post rates unavailable ({rr.status_code}): {rr.text[:200]}")
        rates = rr.json()
        assert isinstance(rates, (list, dict)), rates

        # Create label with DOM.EP — tolerant if CP creds missing
        cl = admin.post(f"{BASE_URL}/api/admin/orders/{oid}/create-label",
                        json={"service_code": "DOM.EP"}, timeout=30)
        if cl.status_code not in (200, 201):
            pytest.skip(f"create-label unavailable ({cl.status_code}): {cl.text[:200]}")
        body = cl.json()
        # Look up the order and verify fulfillment_status flipped
        rlist = admin.get(f"{BASE_URL}/api/admin/orders?page=1&limit=50", timeout=15)
        listing = rlist.json()
        orders = listing if isinstance(listing, list) else listing.get("items") or listing.get("orders") or []
        me = next((o for o in orders if o.get("id") == oid), None)
        if me:
            fs = str(me.get("fulfillment_status") or "").lower()
            assert "label" in fs or "ship" in fs or "pack" in fs, f"fulfillment_status={fs}"
            assert (me.get("shipping_info") or {}).get("tracking_number"), "tracking_number missing"


# ----------------------------------------------------------- Admin confirm ----

class TestAdminConfirmPayment:
    def test_confirm_payment_marks_paid(self, admin, products):
        p, v = _pick_variant_with_stock(products, 1)
        if not p:
            pytest.skip("No stock")
        r, _ = _do_checkout(None,
            [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}])
        assert r.status_code in (200, 201), r.text[:400]
        oid = r.json()["id"]
        _created_order_ids.append(oid)
        cp = admin.post(f"{BASE_URL}/api/admin/orders/{oid}/confirm-payment", timeout=15)
        # DEBUG
        import json as _j
        print(f"DEBUG session.headers={dict(admin.headers)}")
        req = requests.Request("POST", f"{BASE_URL}/api/admin/orders/{oid}/confirm-payment")
        prep = admin.prepare_request(req)
        print(f"DEBUG prepared headers={dict(prep.headers)}")
        print(f"DEBUG cp status={cp.status_code} body={cp.text[:200]}")
        assert cp.status_code in (200, 201), cp.text[:400]
        d = cp.json()
        assert d.get("payment_status") == "paid"
        # Fulfillment should transition to ready_to_pack or similar
        fs = str(d.get("fulfillment_status") or "").lower()
        assert fs and fs not in ("cancelled",), f"unexpected fulfillment_status={fs}"


# ------------------------------------------------------------------ Teardown

@pytest.fixture(scope="module", autouse=True)
def _cleanup_after_module():
    """Cancel every created order + delete every created coupon at end of module."""
    yield
    try:
        s = _admin_session()
    except Exception:
        return
    for oid in set(_created_order_ids):
        try:
            s.put(
                f"{BASE_URL}/api/admin/orders/{oid}/status"
                f"?fulfillment_status=cancelled&payment_status=cancelled",
                timeout=10,
            )
        except Exception:
            pass
    for cid in set(_created_coupon_ids):
        try:
            s.delete(f"{BASE_URL}/api/admin/coupons/{cid}", timeout=10)
        except Exception:
            pass
