"""FIRONOVA iteration 12 — affiliate program (dashboard data + admin controls).

Coverage:
- Admin invite -> user join (token) -> affiliate active with code + coupon.
- GET /api/affiliate/me exposes metrics (tier, commission_rate, tier_is_manual=False).
- Dashboard endpoints: referrals, payouts, performance (revenue+commission),
  insights, clicks (30d series + summary) all return 200 with expected shape.
- Admin: list, overview, and risk panel (signals, manual review, no auto-suspend).
- Manual tier override: admin PUT manual_tier -> /affiliate/me reports the forced
  tier + tier_is_manual=True; PUT clear_manual_tier restores automatic (False).
- Record editing: admin sets memorable code + per-affiliate coupon_percent +
  payout wallet; coupon resynced (code/value); /affiliate/me exposes coupon fields.
- Sources & activité: /affiliate/clicks/sources (top pages/référents/appareils),
  /affiliate/activity (flux fusionné), garde-fou trimestriel (quarter_target/
  quarter_progress/quarter_warning) dans /affiliate/me.
- Admin attribution: /admin/affiliates/clicks (tendance, top sources, top
  affiliés par clics, conversions 30j) + liste enrichie de clics par affilié.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for path in ("/app/frontend/.env", ".env"):
        try:
            with open(path, "r") as f:
                for ln in f:
                    if ln.strip().startswith("REACT_APP_BACKEND_URL="):
                        BASE_URL = ln.strip().split("=", 1)[1].strip().rstrip("/")
                        break
        except OSError:
            continue
assert BASE_URL

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin-pass")

VALID_TIERS = {"standard", "bronze", "silver", "gold", "platinum", "diamond"}


# ----------------------- helpers -----------------------
def _admin_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = s.cookies.get("access_token")
    assert tok, "admin login: no access_token cookie (auth cookie-only)"
    return tok


def _invite(admin_tok, email):
    r = requests.post(f"{BASE_URL}/api/admin/affiliates/invite",
                      headers={"Cookie": f"access_token={admin_tok}"},
                      json={"email": email, "name": "Affiliate Tester",
                            "lang": "fr", "payout_currency": "btc"}, timeout=20)
    assert r.status_code == 200, f"invite failed: {r.status_code} {r.text}"
    link = r.json().get("invite_link", "")
    token = link.split("token=", 1)[1] if "token=" in link else ""
    assert token, f"no token in invite_link: {link}"
    return token


@pytest.fixture(scope="module")
def admin_tok():
    return _admin_token()


@pytest.fixture(scope="module")
def affiliate(admin_tok):
    """Crée un affilié actif frais : invite admin -> join passwordless."""
    email = f"iter12_{uuid.uuid4().hex[:8]}@example.com"
    token = _invite(admin_tok, email)
    session = requests.Session()
    r = session.post(f"{BASE_URL}/api/affiliate/join",
                     json={"token": token, "payout_address": "", "payout_currency": "usdt"},
                     timeout=20)
    assert r.status_code == 200, f"join failed: {r.status_code} {r.text}"
    user_tok = session.cookies.get("access_token")
    assert user_tok, "join returned no access cookie"
    me = requests.get(f"{BASE_URL}/api/affiliate/me",
                      headers={"Cookie": f"access_token={user_tok}"}, timeout=20)
    assert me.status_code == 200, me.text
    return {"email": email, "user_tok": user_tok, "me": me.json()}


# ----------------------- join + profile -----------------------
def test_affiliate_join_activates_profile(affiliate):
    me = affiliate["me"]
    assert me["status"] == "active"
    assert me.get("code"), "affiliate code missing after join"
    assert me["tier"] in VALID_TIERS
    assert 0.10 <= me["commission_rate"] <= 0.20
    assert me["tier_is_manual"] is False
    assert me.get("manual_tier") is None
    assert me["compliance_status"] in ("compliant", "review", "suspended")


def test_affiliate_dashboard_endpoints(affiliate):
    h = {"Cookie": f"access_token={affiliate['user_tok']}"}
    # Referrals
    r = requests.get(f"{BASE_URL}/api/affiliate/referrals", headers=h, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    # Payouts
    r = requests.get(f"{BASE_URL}/api/affiliate/payouts", headers=h, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    # Performance : séries mensuelles avec revenue ET commission
    r = requests.get(f"{BASE_URL}/api/affiliate/performance", headers=h, timeout=20)
    assert r.status_code == 200
    perf = r.json()
    assert "series" in perf
    for s in perf["series"]:
        assert "month" in s and "revenue" in s and "commission" in s
    # Insights
    r = requests.get(f"{BASE_URL}/api/affiliate/insights", headers=h, timeout=20)
    assert r.status_code == 200
    ins = r.json()
    for k in ("current_month", "clicks", "validated_orders"):
        assert k in ins, f"insights missing {k}"
    # Clics : série 30j + résumé
    r = requests.get(f"{BASE_URL}/api/affiliate/clicks", headers=h, timeout=20)
    assert r.status_code == 200
    ck = r.json()
    assert "series" in ck and "summary" in ck
    assert "total_clicks" in ck["summary"] and "conversion_rate" in ck["summary"]
    assert 7 <= len(ck["series"]) <= 90


# ----------------------- admin views -----------------------
def test_admin_affiliates_list_overview_risk(admin_tok):
    h = {"Cookie": f"access_token={admin_tok}"}
    r = requests.get(f"{BASE_URL}/api/admin/affiliates", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)

    r = requests.get(f"{BASE_URL}/api/admin/affiliates/overview", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    ov = r.json()
    for k in ("financial", "affiliates", "alerts", "attribution",
              "monthly_series", "top_affiliates", "tier_distribution"):
        assert k in ov, f"overview missing {k}"

    r = requests.get(f"{BASE_URL}/api/admin/affiliates/risk", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    rk = r.json()
    assert "affiliates" in rk and "flagged_count" in rk
    for a in rk["affiliates"]:
        assert a["risk_level"] in ("high", "warning")
        assert isinstance(a["signals"], list)
        assert "insufficient_data" in a
        assert "validated_orders" in a and "reversed_orders" in a


# ----------------------- manual tier override -----------------------
def test_manual_tier_override_cycle(admin_tok, affiliate):
    h = {"Cookie": f"access_token={admin_tok}"}
    aid = affiliate["me"]["id"]

    # Applique un palier manuel
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"manual_tier": "gold"}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("manual_tier") == "gold"

    # L'affilié voit le palier forcé + flag
    me = requests.get(f"{BASE_URL}/api/affiliate/me",
                      headers={"Cookie": f"access_token={affiliate['user_tok']}"}, timeout=20)
    assert me.status_code == 200
    j = me.json()
    assert j["tier"] == "gold"
    assert j["tier_is_manual"] is True
    assert j["commission_rate"] == pytest.approx(0.16)
    assert j["manual_tier"] == "gold"

    # Rétablit le calcul automatique
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"clear_manual_tier": True}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("manual_tier") is None

    me = requests.get(f"{BASE_URL}/api/affiliate/me",
                      headers={"Cookie": f"access_token={affiliate['user_tok']}"}, timeout=20)
    assert me.status_code == 200
    j = me.json()
    assert j["tier_is_manual"] is False
    assert j["manual_tier"] is None
    assert j["tier"] in VALID_TIERS


def test_manual_tier_validation_rejects_unknown(admin_tok, affiliate):
    h = {"Cookie": f"access_token={admin_tok}"}
    aid = affiliate["me"]["id"]
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"manual_tier": "not-a-tier"}, timeout=20)
    assert r.status_code == 400, f"expected 400 for invalid manual_tier, got {r.status_code} {r.text}"


# ----------------------- record editing + coupon resync -----------------------
def test_admin_record_edit_and_coupon_resync(admin_tok, affiliate):
    """Code promo mémorisable + rabais par affilié : la fiche est modifiée ET le
    coupon promo est resynchronisé (code + valeur), visible côté admin et affilié."""
    h = {"Cookie": f"access_token={admin_tok}"}
    aid = affiliate["me"]["id"]
    old_code = affiliate["me"].get("code") or ""
    new_code = f"JULIE{aid.replace('-', '')[:8]}".upper()

    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h,
                     json={"code": new_code, "coupon_percent": 15,
                           "payout_address": "0x0000000000000000000000000000000000000012",
                           "payout_currency": "usdt", "suspension_reason": ""},
                     timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("code") == new_code
    assert r.json().get("coupon_percent") == 15

    # La fiche (detail admin) reflète les changements
    r = requests.get(f"{BASE_URL}/api/admin/affiliates/{aid}", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    aff = r.json()["affiliate"]
    assert aff["code"] == new_code
    assert aff["coupon_percent"] == 15
    assert aff["payout_address"].startswith("0x")

    # Le coupon promo est resynchronisé : même code + même valeur
    r = requests.get(f"{BASE_URL}/api/admin/coupons", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    coupons = {c.get("code"): c for c in (r.json() if isinstance(r.json(), list) else r.json().get("coupons", []))}
    assert new_code in coupons, f"coupon {new_code} not found in {list(coupons)}"
    assert float(coupons[new_code].get("value", 0)) == pytest.approx(15.0)
    assert coupons[new_code].get("affiliate_id") == aid

    # L'affilié voit son code promo + le rabais effectif
    me = requests.get(f"{BASE_URL}/api/affiliate/me",
                      headers={"Cookie": f"access_token={affiliate['user_tok']}"}, timeout=20)
    assert me.status_code == 200, me.text
    j = me.json()
    assert j["coupon_code"] == new_code
    assert j["coupon_percent"] == pytest.approx(15.0)

    # Reset : null -> retour au défaut env (coupon_percent None côté fiche)
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"coupon_percent": None}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("coupon_percent") is None

    # remet un code aléatoire propre pour ne pas polluer les tests suivants
    requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                 headers=h, json={"code": old_code}, timeout=20)


def test_admin_record_validation(admin_tok, affiliate):
    h = {"Cookie": f"access_token={admin_tok}"}
    aid = affiliate["me"]["id"]
    # Code illisible / trop court
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"code": "ab"}, timeout=20)
    assert r.status_code == 400, f"expected 400 for short code, got {r.status_code} {r.text}"
    # Code avec caractères interdits
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"code": "JULIÉ!"}, timeout=20)
    assert r.status_code == 400, f"expected 400 for bad code, got {r.status_code} {r.text}"
    # Rabais hors bornes
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"coupon_percent": 150}, timeout=20)
    assert r.status_code == 422, f"expected 422 for coupon_percent > 100, got {r.status_code} {r.text}"
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"coupon_percent": -5}, timeout=20)
    assert r.status_code == 422, f"expected 422 for coupon_percent < 0, got {r.status_code} {r.text}"


def test_admin_invite_with_memorable_code(admin_tok):
    """L'invitation peut fixer d'emblée un code promo mémorisable + rabais."""
    email = f"iter12_{uuid.uuid4().hex[:8]}@example.com"
    custom_code = f"FIRON{uuid.uuid4().hex[:8]}".upper()
    r = requests.post(f"{BASE_URL}/api/admin/affiliates/invite",
                      headers={"Cookie": f"access_token={admin_tok}"},
                      json={"email": email, "name": "Invite Memo",
                            "lang": "fr", "code": custom_code, "coupon_percent": 10},
                      timeout=20)
    assert r.status_code == 200, r.text
    link = r.json().get("invite_link", "")
    token = link.split("token=", 1)[1] if "token=" in link else ""
    assert token
    r = requests.post(f"{BASE_URL}/api/affiliate/join",
                      json={"token": token, "payout_address": "", "payout_currency": "usdt"},
                      timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("code") == custom_code, f"expected code {custom_code}, got {j.get('code')}"
    assert j.get("coupon_percent") == pytest.approx(10.0)


# ----------------------- sources, activité, garde-fou trimestriel -----------------------
def test_affiliate_clicks_sources_shape(affiliate):
    h = {"Cookie": f"access_token={affiliate['user_tok']}"}
    r = requests.get(f"{BASE_URL}/api/affiliate/clicks/sources", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    s = r.json()
    for k in ("days", "total_clicks", "top_pages", "top_referrers", "devices"):
        assert k in s, f"sources missing {k}"
    for item in s["top_pages"]:
        assert "source" in item and "clicks" in item


def test_affiliate_activity_feed_shape(affiliate):
    h = {"Cookie": f"access_token={affiliate['user_tok']}"}
    r = requests.get(f"{BASE_URL}/api/affiliate/activity", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    feed = r.json()
    assert isinstance(feed, list)
    for e in feed:
        assert e["type"] in ("click", "referral", "payout")
        assert "at" in e


def test_affiliate_me_quarter_guard(affiliate):
    h = {"Cookie": f"access_token={affiliate['user_tok']}"}
    r = requests.get(f"{BASE_URL}/api/affiliate/me", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("quarter_target", "quarter_progress", "quarter_warning", "next_review"):
        assert k in j, f"/affiliate/me missing {k}"
    assert isinstance(j["quarter_warning"], bool)


def test_admin_clicks_analytics_and_list(admin_tok):
    h = {"Cookie": f"access_token={admin_tok}"}
    r = requests.get(f"{BASE_URL}/api/admin/affiliates/clicks", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    c = r.json()
    for k in ("days", "total_clicks", "conversions_30d", "active_affiliates",
              "trend", "top_pages", "top_referrers", "devices", "top_affiliates"):
        assert k in c, f"admin clicks missing {k}"
    for p in c["trend"]:
        assert "date" in p and "clicks" in p

    r = requests.get(f"{BASE_URL}/api/admin/affiliates", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert isinstance(rows, list)
    for a in rows:
        assert "clicks" in a and "last_click_at" in a
