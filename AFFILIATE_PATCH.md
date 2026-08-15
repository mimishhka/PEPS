# PATCH COMPLET — Programme d'affiliation Fironova (iteration_4, P0 dashboards)

> **À donner tel quel à ton IA.** Ce fichier contient TOUT ce qu'il faut pour apporter les changements du programme d'affiliation : dépendances, code backend à ajouter/remplacer, code frontend à ajouter/remplacer, et le fichier de tests complet.

---

## SOMMAIRE

1. Instructions générales
2. Dépendances
3. Backend — code à ajouter/remplacer dans `backend/server.py`
4. Frontend — code à ajouter/remplacer
5. Tests — fichier `backend/tests/test_iter12_affiliate.py` (remplacement complet)
6. Commandes de validation

---

## 1. INSTRUCTIONS GÉNÉRALES

- **Backend** : toutes les modifications se font dans `backend/server.py`. Rien d'autre.
- **Frontend** : 5 fichiers — `package.json`, `src/hooks/useAffiliateRef.js` (remplacement), `src/App.js` (2 lignes), `src/pages/AffiliateDashboard.jsx`, `src/pages/admin/sections/AdminAffiliates.jsx`.
- **Ne jamais supprimer** un endpoint existant ni un `data-testid` existant.
- Le helper `L = (fr, en) => (lang === "fr" ? fr : en)` est défini dans chaque composant — l'utiliser pour tout texte bilingue.
- Ne pas ajouter de commentaires superflus.

---

## 2. DÉPENDANCES

### 2.1 Backend — `backend/requirements.txt`

**AUCUN ajout.** Tous les modules utilisés y figurent déjà : `fastapi`, `motor`, `pymongo`, `httpx`, `resend`, `reportlab`, `bcrypt`, `PyJWT`, `python-dotenv`, `Pillow`, `pydantic`, `email-validator`, `pytest`, `requests` + stdlib.

### 2.2 Frontend — `frontend/package.json`

**Ajouter** dans `dependencies` (une seule ligne) :

```json
    "qrcode.react": "^4.2.0",
```

**Puis installer** (obligatoire avant build) :

```bash
cd frontend
npm install --legacy-peer-deps
```

---

## 3. BACKEND — MODIFICATIONS DANS `backend/server.py`

### 3.1 Helpers trimestriels + domaine référent (À AJOUTER)

Ajouter ces 4 fonctions dans la zone des helpers `_affiliate_*` du bloc affiliation :

```python
def _affiliate_referrer_domain(url: str) -> str:
    """Réduit un référent URL à son domaine (netloc) pour l'analyse des sources."""
    url = (url or "").strip()
    if not url:
        return ""
    try:
        from urllib.parse import urlparse
        net = (urlparse(url if "://" in url else "//" + url).netloc or "").lower()
        return net[4:] if net.startswith("www.") else net
    except Exception:
        return url[:120]


def _affiliate_quarter_start(now: Optional[datetime] = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    q_month = 3 * ((now.month - 1) // 3) + 1
    return now.replace(month=q_month, day=1, hour=0, minute=0,
                       second=0, microsecond=0)


def _affiliate_next_quarter_start(now: Optional[datetime] = None) -> datetime:
    qs = _affiliate_quarter_start(now)
    # +3 mois
    month = qs.month + 3
    year = qs.year + (1 if month > 12 else 0)
    month = month - 12 if month > 12 else month
    return qs.replace(year=year, month=month)


def _affiliate_prev_quarter_start(now: Optional[datetime] = None) -> datetime:
    qs = _affiliate_quarter_start(now)
    month = qs.month - 3
    year = qs.year
    if month <= 0:
        month += 12
        year -= 1
    return qs.replace(year=year, month=month)
```

### 3.2 `affiliate_capture_click` (À REMPLACER)

**Remplace** la fonction existante `affiliate_capture_click` :

```python
async def affiliate_capture_click(request: Request, response: Response, code: str,
                                  page: str = "", referrer: str = "", device: str = "") -> None:
    """Pose le cookie d'attribution (httpOnly) + journalise le clic.
    Attribution au PREMIER clic : si un cookie fn_ref valide est déjà posé,
    on le conserve (le référent d'origine garde la commande).
    page/referrer/device sont des métadonnées d'analyse de sources (optionnelles)."""
    code = (code or "").strip().upper()
    if not code:
        return
    existing = request.cookies.get(AFFILIATE_COOKIE_NAME)
    if existing and existing.strip().upper():
        return  # premier clic conservé — pas d'écrasement
    affiliate = await db.affiliates.find_one(
        {"code": code, "status": "active"}, {"_id": 0, "id": 1, "code": 1}
    )
    if not affiliate:
        return
    now = datetime.now(timezone.utc)
    response.set_cookie(
        AFFILIATE_COOKIE_NAME, code,
        max_age=AFFILIATE_COOKIE_DAYS * 86400,
        httponly=True, samesite="lax", secure=True, path="/",
    )
    click_doc = {
        "id": str(uuid.uuid4()),
        "affiliate_id": affiliate["id"],
        "code": code,
        "ip_hash": _affiliate_hash_ip(_client_ip(request)),  # noqa: F821
        "user_agent": (request.headers.get("user-agent", "") or "")[:300],
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=AFFILIATE_CLICK_TTL_DAYS)).isoformat(),
    }
    click_doc["page"] = (page or "")[:300]
    click_doc["referrer"] = (referrer or "")[:300]
    click_doc["device"] = (device or "")[:40]
    await db.affiliate_clicks.insert_one(click_doc)
```

### 3.3 Endpoint `GET /affiliate/ref/{code}` (À REMPLACER)

```python
@api.get("/affiliate/ref/{code}")  # noqa: F821
async def affiliate_ref(code: str, request: Request, response: Response,
                        page: str = "", referrer: str = "", device: str = ""):
    """Endpoint de tracking : pose le cookie et renvoie ok. Le frontend appelle
    ceci au 1er chargement quand ?ref=CODE est présent dans l'URL.
    page/referrer/device (optionnels) alimentent l'analyse des sources."""
    _rate_limit("affiliate_ref", _client_ip(request), 60, 60,  # noqa: F821
                "Trop de requêtes.")
    await affiliate_capture_click(request, response, code,
                                  page=page, referrer=referrer, device=device)
    return {"ok": True}
```

### 3.4 Garde-fou trimestriel dans `_affiliate_compute_metrics` (À AJOUTER)

**Insérer** ce bloc juste avant le `return { ... }` de `_affiliate_compute_metrics` (le helper qui alimente `/affiliate/me`), et **ajouter** les clés au dict retourné :

```python
    # Garde-fou trimestriel : pour CONSERVER le palier effectif, il faut que le CA
    # du trimestre reste >= au plancher du palier (sinon descente d'un niveau max).
    floor, _ceil = _affiliate_tier_bounds(effective)
    quarter_target = round(floor, 2)
    quarter_progress = min(1.0, quarter / floor) if floor > 0 else None
    quarter_warning = bool(quarter < floor and _affiliate_tier_index(effective) > 0)
```

Dans le dict retourné, les clés suivantes doivent exister :

```python
        "quarter_revenue": round(quarter, 2),
        "quarter_target": quarter_target,
        "quarter_progress": round(quarter_progress, 4) if quarter_progress is not None else None,
        "quarter_warning": quarter_warning,
        "next_review": _affiliate_next_quarter_start().isoformat(),
```

### 3.5 Endpoint `GET /affiliate/clicks/sources` (À AJOUTER)

Ajouter après `/affiliate/clicks` :

```python
@api.get("/affiliate/clicks/sources")  # noqa: F821
async def affiliate_clicks_sources(request: Request, days: int = 30):
    """Top sources des clics de l'affilié : pages d'atterrissage, domaines
    référents et types d'appareil (30 derniers jours par défaut)."""
    aff = await get_current_affiliate(request)
    days = max(7, min(int(days), 90))
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pages, refs, devices = {}, {}, {}
    total = 0
    cursor = db.affiliate_clicks.find(
        {"affiliate_id": aff["id"], "created_at": {"$gte": start}},
        {"_id": 0, "page": 1, "referrer": 1, "device": 1},
    )
    async for c in cursor:
        total += 1
        page = str(c.get("page") or "").strip() or "direct"
        pages[page] = pages.get(page, 0) + 1
        ref = _affiliate_referrer_domain(str(c.get("referrer") or "")) or "direct"
        refs[ref] = refs.get(ref, 0) + 1
        dev = str(c.get("device") or "").strip() or "unknown"
        devices[dev] = devices.get(dev, 0) + 1

    def _top(d, n=8):
        return [{"source": k, "clicks": v}
                for k, v in sorted(d.items(), key=lambda kv: kv[1], reverse=True)[:n]]

    return {
        "days": days,
        "total_clicks": total,
        "top_pages": _top(pages),
        "top_referrers": _top(refs),
        "devices": devices,
    }
```

### 3.6 Endpoint `GET /affiliate/activity` (À AJOUTER)

```python
@api.get("/affiliate/activity")  # noqa: F821
async def affiliate_activity(request: Request, limit: int = 20):
    """Flux d'activité récent de l'affilié : clics, commandes et paiements
    fusionnés, triés par date décroissante (type/at/label/status/amount)."""
    aff = await get_current_affiliate(request)
    limit = max(5, min(int(limit), 50))
    events = []

    clicks = await db.affiliate_clicks.find(
        {"affiliate_id": aff["id"]},
        {"_id": 0, "created_at": 1, "page": 1, "device": 1},
    ).sort("created_at", -1).to_list(limit)
    for c in clicks:
        events.append({
            "type": "click", "at": c.get("created_at"),
            "label": str(c.get("page") or ""), "device": str(c.get("device") or ""),
        })

    referrals = await db.affiliate_referrals.find(
        {"affiliate_id": aff["id"], "status": {"$ne": "excluded"}},
        {"_id": 0, "order_number": 1, "status": 1, "commission_amount": 1,
         "base_amount": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(limit)
    for r in referrals:
        events.append({
            "type": "referral", "at": r.get("created_at"),
            "label": str(r.get("order_number") or ""), "status": r.get("status"),
            "amount": round(float(r.get("commission_amount") or 0), 2),
            "base": round(float(r.get("base_amount") or 0), 2),
        })

    payouts = await db.affiliate_payouts.find(
        {"affiliate_id": aff["id"]},
        {"_id": 0, "period": 1, "status": 1, "amount": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(limit)
    for p in payouts:
        events.append({
            "type": "payout", "at": p.get("created_at"),
            "label": str(p.get("period") or ""), "status": p.get("status"),
            "amount": round(float(p.get("amount") or 0), 2),
        })

    events.sort(key=lambda e: str(e.get("at") or ""), reverse=True)
    return events[:limit]
```

### 3.7 `admin_affiliates_list` — enrichir de `clicks` + `last_click_at` (À MODIFIER)

**Insérer** ce bloc dans `admin_affiliates_list` (route `GET /admin/affiliates`), juste avant `return out` :

```python
    # Clics + dernier clic par affilié (colonne liste + tri)
    click_stats = {}
    async for grp in db.affiliate_clicks.aggregate([
        {"$group": {"_id": "$affiliate_id",
                    "clicks": {"$sum": 1},
                    "last": {"$max": "$created_at"}}}
    ]):
        click_stats[grp["_id"]] = {
            "clicks": int(grp.get("clicks", 0)),
            "last": grp.get("last"),
        }
    for item in out:
        cs = click_stats.get(item["id"], {})
        item["clicks"] = cs.get("clicks", 0)
        item["last_click_at"] = cs.get("last")
    return out
```

### 3.8 Endpoint `GET /admin/affiliates/clicks` (À AJOUTER)

Ajouter avant `/admin/affiliates/risk` :

```python
@api.get("/admin/affiliates/clicks")  # noqa: F821
async def admin_affiliates_clicks(admin: dict = Depends(get_admin_user),  # noqa: F821
                                  days: int = 30):
    """Analyse d'attribution à l'échelle du programme : volume de clics,
    tendance quotidienne, top pages/référents/appareils et top affiliés par
    volume de clics."""
    days = max(7, min(int(days), 90))
    start_date = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    q = {"created_at": {"$gte": start_date.isoformat() + "T00:00:00"}}
    trend, per_aff, pages, refs, devices = {}, {}, {}, {}, {}
    total = 0
    cursor = db.affiliate_clicks.find(
        q, {"_id": 0, "created_at": 1, "affiliate_id": 1, "page": 1,
            "referrer": 1, "device": 1},
    )
    async for c in cursor:
        total += 1
        day = str(c.get("created_at", ""))[:10]
        trend[day] = trend.get(day, 0) + 1
        aid = c.get("affiliate_id")
        if aid:
            per_aff[aid] = per_aff.get(aid, 0) + 1
        page = str(c.get("page") or "").strip() or "direct"
        pages[page] = pages.get(page, 0) + 1
        ref = _affiliate_referrer_domain(str(c.get("referrer") or "")) or "direct"
        refs[ref] = refs.get(ref, 0) + 1
        dev = str(c.get("device") or "").strip() or "unknown"
        devices[dev] = devices.get(dev, 0) + 1

    top_affiliates = []
    for aid, n in sorted(per_aff.items(), key=lambda kv: kv[1], reverse=True)[:10]:
        a = await db.affiliates.find_one({"id": aid}, {"_id": 0, "name": 1, "code": 1})
        top_affiliates.append({
            "id": aid, "name": (a or {}).get("name") or "—",
            "code": (a or {}).get("code") or "", "clicks": n,
        })

    series = []
    for i in range(days):
        d = (start_date + timedelta(days=i)).isoformat()
        series.append({"date": d, "clicks": trend.get(d, 0)})

    def _top(d, n=8):
        return [{"source": k, "clicks": v}
                for k, v in sorted(d.items(), key=lambda kv: kv[1], reverse=True)[:n]]

    # Conversions validées sur la même fenêtre (approved|paid)
    conversions_30d = 0
    rcursor = db.affiliate_referrals.find(
        {"status": {"$in": ["approved", "paid"]},
         "$or": [{"approved_at": {"$gte": start_date.isoformat() + "T00:00:00"}},
                 {"created_at": {"$gte": start_date.isoformat() + "T00:00:00"}}]},
        {"_id": 0, "approved_at": 1, "created_at": 1},
    )
    async for r in rcursor:
        ts = r.get("approved_at") or r.get("created_at")
        if str(ts or "")[:10] >= start_date.isoformat():
            conversions_30d += 1

    return {
        "days": days,
        "total_clicks": total,
        "conversions_30d": conversions_30d,
        "active_affiliates": len(per_aff),
        "trend": series,
        "top_pages": _top(pages),
        "top_referrers": _top(refs),
        "devices": devices,
        "top_affiliates": top_affiliates,
    }
```

---

## 4. FRONTEND — MODIFICATIONS

### 4.1 `frontend/src/hooks/useAffiliateRef.js` (REMPLACEMENT COMPLET)

```js
// frontend/src/hooks/useAffiliateRef.js
// Capture le parametre ?ref=CODE au premier chargement et pose le cookie
// d'attribution cote backend (httpOnly). Idempotent par session.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import api from "../lib/api";

const SESSION_KEY = "fn_ref_captured";

// Types d'appareil pour l'analyse des sources (stocké côté backend).
const detectDevice = () => {
  try {
    const ua = navigator.userAgent || "";
    if (/ipad|tablet/i.test(ua)) return "tablet";
    if (/mobi/i.test(ua)) return "mobile";
  } catch {
    /* noop */
  }
  return "desktop";
};

export default function useAffiliateRef() {
  const location = useLocation();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const code = new URLSearchParams(location.search).get("ref");
    if (!code) return;
    // evite les appels repetes dans la meme session
    try {
      if (sessionStorage.getItem(SESSION_KEY) === code) {
        done.current = true;
        return;
      }
    } catch {
      /* sessionStorage indisponible : on continue */
    }
    done.current = true;
    api
      .get(`/affiliate/ref/${encodeURIComponent(code)}`, {
        params: {
          page: location.pathname || "/",
          referrer: (() => { try { return document.referrer || ""; } catch { return ""; } })(),
          device: detectDevice(),
        },
      })
      .then(() => {
        try {
          sessionStorage.setItem(SESSION_KEY, code);
        } catch {
          /* noop */
        }
      })
      .catch(() => {
        /* silencieux : l'attribution ne doit jamais bloquer l'UX */
      });
  }, [location.search]);
}
```

### 4.2 `frontend/src/App.js` (MODIFIER — 3 insertions)

1. **Import** (dans le bloc d'imports) :
```js
import useAffiliateRef from "./hooks/useAffiliateRef";
```

2. **Appel** (dans le composant, avant le return du router) :
```js
useAffiliateRef();
```

3. **Routes** (si elles n'existent pas déjà) :
```jsx
<Route path="/affiliate/join" element={<AffiliateJoin />} />
<Route path="/affiliate" element={<ProtectedRoute><AffiliateDashboard /></ProtectedRoute>} />
```
(Les imports `AffiliateDashboard` et `AffiliateJoin` doivent aussi exister.)

### 4.3 `frontend/src/pages/AffiliateDashboard.jsx`

#### a) Imports — ajouter en tête

```js
import { QRCodeSVG } from "qrcode.react";
```
Fusionner dans l'import lucide-react existant :
```js
import {
  MousePointerClick, ShoppingBag, Wallet, Download, ShieldAlert,
  MessageCircle, Send, Mail, Activity,
} from "lucide-react";
```

#### b) Helpers module — ajouter après `money` (s'il manque)

```js
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (headers, rows) =>
  [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");

const downloadCsv = (filename, headers, rows) => {
  const blob = new Blob(["\uFEFF" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const PAGE_SIZE = 10;

const fmtDate = (iso, lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" });
};
const fmtDateTime = (iso, lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

function Pagination({ page, total, pageSize, onChange, L }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-ash">
      <p className="text-[11px] text-glacier">
        {L("Page", "Page")} {page} / {pages}
      </p>
      <div className="flex gap-1.5">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}
          className="px-3 py-1 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical disabled:opacity-40">
          {L("Précédent", "Prev")}
        </button>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)}
          className="px-3 py-1 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical disabled:opacity-40">
          {L("Suivant", "Next")}
        </button>
      </div>
    </div>
  );
}
```

#### c) État — ajouter

```js
  const [sources, setSources] = useState(null);
  const [activity, setActivity] = useState([]);
  const [refPage, setRefPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
```

#### d) `load()` — étendre le `Promise.allSettled`

Remplacer le bloc `Promise.allSettled` existant par :

```js
      setRefPage(1); setPayPage(1);
      const [r, p, perf, ins, ck, src, act] = await Promise.allSettled([
        api.get("/affiliate/referrals"),
        api.get("/affiliate/payouts"),
        api.get("/affiliate/performance"),
        api.get("/affiliate/insights"),
        api.get("/affiliate/clicks"),
        api.get("/affiliate/clicks/sources"),
        api.get("/affiliate/activity"),
      ]);
      setReferrals(r.status === "fulfilled" ? (r.value.data || []) : []);
      setPayouts(p.status === "fulfilled" ? (p.value.data || []) : []);
      setInsights(ins.status === "fulfilled" ? (ins.value.data || null) : null);
      setClicksStats(ck.status === "fulfilled" ? (ck.value.data || null) : null);
      setSources(src.status === "fulfilled" ? (src.value.data || null) : null);
      setActivity(act.status === "fulfilled" ? (act.value.data || []) : []);
```

#### e) Fonctions partage + CSV — ajouter (après `copyLink`)

```js
  const share = (kind) => {
    const url = encodeURIComponent(refLink);
    const text = encodeURIComponent(
      L(`Découvrez la gamme Fironova avec mon code promo ${refCode || ""}`, `Check out Fironova with my promo code ${refCode || ""}`)
    );
    const targets = {
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      email: `mailto:?subject=${encodeURIComponent(L("Recommandation Fironova", "Fironova recommendation"))}&body=${text}%20${url}`,
    };
    try { window.open(targets[kind], "_blank", "noopener,noreferrer"); }
    catch { toast.error(L("Ouverture impossible", "Unable to open")); }
  };

  const exportReferrals = () =>
    downloadCsv(
      `fironova-referrals-${refCode}.csv`,
      ["Order", "Base", "Commission", "Status", "Date"],
      referrals.map((r) => [
        r.order_number, r.base_amount, r.commission_amount, r.status,
        fmtDate(r.created_at, lang),
      ])
    );

  const exportPayouts = () =>
    downloadCsv(
      `fironova-payouts-${refCode}.csv`,
      ["Period", "Amount", "Currency", "Status", "Reference"],
      payouts.map((p) => [p.period, p.amount, p.currency, p.status, p.reference])
    );

  const refPageRows = referrals.slice((refPage - 1) * PAGE_SIZE, refPage * PAGE_SIZE);
  const payPageRows = payouts.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);
```

#### f) Overview — carte « Sécurisez votre palier » (ajouter après la carte TIER PROGRESSION)

```jsx
            {/* Garde-fou trimestriel : sécuriser son palier */}
            {data?.quarter_target > 0 && (
              <div className={`bg-white rounded-2xl border p-6 ${data.quarter_warning ? "border-warning/50 bg-warning/5" : "border-ash"}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                      {L("SÉCURISEZ VOTRE PALIER", "PROTECT YOUR TIER")}
                    </p>
                    <p className="font-display text-2xl font-bold text-nordfjord tabular-nums">
                      {money(data.quarter_revenue)}
                      <span className="text-sm font-medium text-glacier"> / {money(data.quarter_target)}</span>
                    </p>
                  </div>
                  {data.quarter_warning && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/15 text-warning text-[11px] font-semibold">
                      <ShieldAlert size={14} />
                      {L("Sous le plancher", "Below floor")}
                    </span>
                  )}
                </div>
                <div className="h-3 rounded-full bg-ash overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                       style={{ width: `${Math.min(100, Math.round((data.quarter_progress || 0) * 100))}%`,
                                background: data.quarter_warning ? "#E8A33D" : "#00B8D4" }} />
                </div>
                <p className="font-data text-[11px] text-glacier mt-2">
                  {data.quarter_warning ? (
                    <>{L(
                      "Votre CA du trimestre est sous le plancher de votre palier. À la prochaine réévaluation (",
                      "Your quarterly revenue is below your tier floor. At the next review (")}
                      {fmtDate(data.next_review, lang)}
                      {L("), vous pourriez descendre d'un palier.", "), you could drop one tier.")}
                    </>
                  ) : (
                    <>{L(
                      "Maintenez au moins ce montant de ventes validées d'ici la prochaine réévaluation (",
                      "Keep at least this amount of validated sales before the next review (")}
                      {fmtDate(data.next_review, lang)}
                      {L(") pour conserver votre palier.", ") to keep your tier.")}
                    </>
                  )}
                </p>
              </div>
            )}
```

#### g) Overview — carte « Activité récente » (ajouter après la carte ci-dessus)

```jsx
            {/* Activité récente */}
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {L("ACTIVITÉ RÉCENTE", "RECENT ACTIVITY")}
              </p>
              {activity.length === 0 ? (
                <p className="text-glacier text-sm py-6 text-center">
                  {L("Aucune activité pour l'instant.", "No activity yet.")}
                </p>
              ) : (
                <div className="space-y-1">
                  {activity.slice(0, 8).map((e, i) => (
                    <ActivityRow key={i} e={e} L={L} lang={lang} money={money} fmtDateTime={fmtDateTime} />
                  ))}
                </div>
              )}
            </div>
```

#### h) Overview — QR code + partage dans « VOTRE LIEN DE PARRAINAGE »

Ajouter les boutons de partage après le bouton Copier, et le QR à droite du conteneur flex :

```jsx
                  <div className="flex items-center gap-2 mt-4">
                    <button onClick={() => share("whatsapp")} title={L("WhatsApp", "WhatsApp")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                      <MessageCircle size={14} className="text-success" /> WhatsApp
                    </button>
                    <button onClick={() => share("telegram")} title={L("Telegram", "Telegram")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                      <Send size={14} className="text-nova" /> Telegram
                    </button>
                    <button onClick={() => share("email")} title={L("Email", "Email")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                      <Mail size={14} className="text-nordfjord" /> Email
                    </button>
                  </div>
```

```jsx
                {refLink && (
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="bg-white border border-ash rounded-xl p-3">
                      <QRCodeSVG value={refLink} size={120} level="M" fgColor="#0B2E4F" />
                    </div>
                    <p className="font-data text-[10px] uppercase tracking-wider text-glacier">
                      {L("Scanner pour partager", "Scan to share")}
                    </p>
                  </div>
                )}
```

#### i) Performance — section « Sources de vos clics » (ajouter avant COMMANDES VALIDÉES)

```jsx
            {/* Top sources des clics */}
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                {L("SOURCES DE VOS CLICS", "WHERE YOUR CLICKS COME FROM")}
              </p>
              <p className="font-data text-[11px] text-glacier mb-4">
                {L("Derniers 30 jours — pages d'atterrissage, référents et appareils.",
                   "Last 30 days — landing pages, referrers and devices.")}
              </p>
              {!sources || sources.total_clicks === 0 ? (
                <p className="text-glacier text-sm py-8 text-center">
                  {L("Aucun clic enregistré pour l'instant.", "No clicks recorded yet.")}
                </p>
              ) : (
                <SourcesGrid sources={sources} L={L} lang={lang} />
              )}
            </div>
```

#### j) Performance — CSV + pagination sur COMMANDES VALIDÉES (remplacer la carte)

```jsx
            <div className="bg-white rounded-2xl border border-ash overflow-hidden">
              <div className="px-6 py-4 border-b border-ash flex items-center justify-between">
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
                  {L("COMMANDES VALIDÉES", "VALIDATED ORDERS")}
                </p>
                <button onClick={exportReferrals}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                  <Download size={13} /> CSV
                </button>
              </div>
              <ReferralTable rows={refPageRows} lang={lang} L={L} money={money} />
              <Pagination page={refPage} total={referrals.length} pageSize={PAGE_SIZE}
                onChange={setRefPage} L={L} />
            </div>
```

#### k) Paiements — CSV + pagination

Dans « HISTORIQUE DES PAIEMENTS » : ajouter le bouton CSV (`onClick={exportPayouts}`) dans le header, mapper `payPageRows` au lieu de `payouts`, et ajouter sous le tableau :

```jsx
                <Pagination page={payPage} total={payouts.length} pageSize={PAGE_SIZE}
                  onChange={setPayPage} L={L} />
```

#### l) Composants annexes (ajouter au niveau module)

```jsx
function SourceBars({ rows, max, fmt, L }) {
  if (!rows || rows.length === 0) {
    return <p className="text-glacier text-[11px]">{L("Aucune donnée.", "No data.")}</p>;
  }
  const n = max || rows[0]?.clicks || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.source} className="flex items-center gap-2">
          <span className="text-[11px] text-nordfjord w-[120px] truncate" title={r.source}>{fmt(r.source)}</span>
          <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
            <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (r.clicks / n) * 100)}%` }} />
          </div>
          <span className="text-[11px] text-glacier tabular-nums w-8 text-right">{r.clicks}</span>
        </div>
      ))}
    </div>
  );
}

function SourcesGrid({ sources, L, lang }) {
  const devLabels = {
    desktop: L("Ordinateur", "Desktop"),
    mobile: L("Mobile", "Mobile"),
    tablet: L("Tablette", "Tablet"),
    unknown: L("Inconnu", "Unknown"),
  };
  const devices = Object.entries(sources.devices || {}).sort((a, b) => b[1] - a[1]);
  const devTotal = devices.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-2">
          {L("PAGES D'ATTERRISSAGE", "LANDING PAGES")}
        </p>
        <SourceBars rows={sources.top_pages} L={L}
          fmt={(s) => (s === "direct" ? L("Accès direct", "Direct") : s)} />
      </div>
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-2">
          {L("RÉFÉRENTS", "REFERRERS")}
        </p>
        <SourceBars rows={sources.top_referrers} L={L}
          fmt={(s) => (s === "direct" ? L("Accès direct", "Direct") : s)} />
      </div>
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-2">
          {L("APPAREILS", "DEVICES")}
        </p>
        <div className="space-y-1.5">
          {devices.length === 0 && (
            <p className="text-glacier text-[11px]">{L("Aucune donnée.", "No data.")}</p>
          )}
          {devices.map(([k, n]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[11px] text-nordfjord w-[120px] truncate">{devLabels[k] || k}</span>
              <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
                <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (n / devTotal) * 100)}%` }} />
              </div>
              <span className="text-[11px] text-glacier tabular-nums w-8 text-right">{Math.round((n / devTotal) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ e, L, lang, money, fmtDateTime }) {
  if (e.type === "click") {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-ash/40 last:border-0">
        <span className="w-8 h-8 rounded-lg bg-nova/10 text-nova grid place-items-center shrink-0">
          <MousePointerClick size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-nordfjord">
            {L("Clic sur votre lien", "Click on your link")}
            {e.label ? <span className="text-glacier"> · {e.label}</span> : null}
          </p>
        </div>
        <span className="text-[11px] text-glacier shrink-0">{fmtDateTime(e.at, lang)}</span>
      </div>
    );
  }
  if (e.type === "referral") {
    const m = REFERRAL_STATUS_META[e.status] || REFERRAL_STATUS_META.pending;
    return (
      <div className="flex items-center gap-3 py-2 border-b border-ash/40 last:border-0">
        <span className="w-8 h-8 rounded-lg bg-success/10 text-success grid place-items-center shrink-0">
          <ShoppingBag size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-nordfjord">
            {L("Commande", "Order")} <span className="font-semibold">{e.label || "—"}</span>
            {e.base != null ? <span className="text-glacier"> · {money(e.base)}</span> : null}
          </p>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.cls}`}>
            {lang === "fr" ? m.fr : m.en}
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-nordfjord tabular-nums">{money(e.amount)}</p>
          <p className="text-[11px] text-glacier">{fmtDateTime(e.at, lang)}</p>
        </div>
      </div>
    );
  }
  // payout
  return (
    <div className="flex items-center gap-3 py-2 border-b border-ash/40 last:border-0">
      <span className="w-8 h-8 rounded-lg bg-warning/10 text-warning grid place-items-center shrink-0">
        <Wallet size={15} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-nordfjord">
          {L("Paiement", "Payout")} <span className="font-semibold">{e.label || "—"}</span>
        </p>
        <p className="text-[11px] text-glacier uppercase">{e.status}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-nordfjord tabular-nums">{money(e.amount)}</p>
        <p className="text-[11px] text-glacier">{fmtDateTime(e.at, lang)}</p>
      </div>
    </div>
  );
}
```

**Note** : `REFERRAL_STATUS_META` doit exister au niveau module :
```js
const REFERRAL_STATUS_META = {
  pending: { fr: "En attente", en: "Pending", cls: "bg-ash/50 text-glacier" },
  approved: { fr: "Approuvé", en: "Approved", cls: "bg-nova/15 text-nordfjord" },
  paid: { fr: "Payé", en: "Paid", cls: "bg-success/15 text-success" },
  reversed: { fr: "Annulé", en: "Reversed", cls: "bg-error/15 text-error" },
};
```

### 4.4 `frontend/src/pages/admin/sections/AdminAffiliates.jsx`

#### a) Imports lucide — fusionner

```js
import {
  Plus, RefreshCw, Copy, DollarSign, X, Users, TrendingUp, Clock,
  AlertTriangle, MousePointerClick, Award, Wallet, ShieldAlert, Eye,
  Search, Download, BarChart3, Smartphone, Globe, MousePointerClick as CursorClick,
} from "lucide-react";
```

#### b) Helpers module — ajouter (si manquant)

```js
const int = (n) => Number(n || 0).toLocaleString("en-CA");

const PAGE_SIZE = 10;
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (headers, rows) =>
  [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
const downloadCsv = (filename, headers, rows) => {
  const blob = new Blob(["\uFEFF" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString();
};

function AdminPagination({ page, total, onChange, L }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-ash">
      <p className="text-[11px] text-glacier">{L("Page", "Page")} {page} / {pages}</p>
      <div className="flex gap-1.5">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}
          className="px-3 py-1 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical disabled:opacity-40">
          {L("Précédent", "Prev")}
        </button>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)}
          className="px-3 py-1 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical disabled:opacity-40">
          {L("Suivant", "Next")}
        </button>
      </div>
    </div>
  );
}

const DEVICE_LABELS = (L) => ({
  desktop: L("Ordinateur", "Desktop"),
  mobile: L("Mobile", "Mobile"),
  tablet: L("Tablette", "Tablet"),
  unknown: L("Inconnu", "Unknown"),
});
```

#### c) État — ajouter

```js
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fTier, setFTier] = useState("");
  const [affPage, setAffPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [clicks, setClicks] = useState(null);
  const [clicksLoading, setClicksLoading] = useState(false);
```

#### d) Chargement des clics — ajouter

```js
  const loadClicks = useCallback(async () => {
    setClicksLoading(true);
    try {
      const { data } = await api.get("/admin/affiliates/clicks");
      setClicks(data || null);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setClicksLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === "clicks") loadClicks(); }, [tab, loadClicks]);
```

#### e) Filtres + CSV — ajouter (dans le composant)

```js
  const ql = (q || "").trim().toLowerCase();
  const filteredRows = rows.filter((a) => {
    if (fStatus && a.status !== fStatus) return false;
    if (fTier && a.tier !== fTier) return false;
    if (ql) {
      const hay = `${a.name || ""} ${a.email || ""} ${a.code || ""}`.toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });
  const affPageRows = filteredRows.slice((affPage - 1) * PAGE_SIZE, affPage * PAGE_SIZE);
  const payPageRows = payouts.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);
  const tierOptions = [...new Set(rows.map((r) => r.tier).filter(Boolean))];

  const exportAffiliates = () =>
    downloadCsv(
      "affiliates.csv",
      ["Name", "Email", "Code", "Discount", "Status", "Compliance", "Tier", "Rate",
       "Validated", "Pending", "Clicks"],
      filteredRows.map((a) => [
        a.name, a.email, a.code, a.coupon_percent != null ? `${a.coupon_percent}%` : "",
        a.status, a.compliance_status, a.tier || "",
        a.commission_rate != null ? `${Math.round(a.commission_rate * 100)}%` : "",
        a.cumulative_revenue != null ? money(a.cumulative_revenue) : "",
        a.pending_commission != null ? money(a.pending_commission) : "",
        a.clicks || 0,
      ])
    );

  const exportPayoutsAll = () =>
    downloadCsv(
      "payouts.csv",
      ["Period", "Affiliate", "Amount", "Currency", "Status", "Refs", "TxRef"],
      payouts.map((p) => [
        p.period, p.affiliate_code, p.amount, p.currency, p.status,
        p.referral_count || 0, p.reference || "",
      ])
    );
```

#### f) Onglet « Attribution » (contenu `{tab === "clicks" && (...)}`)

```jsx
        {tab === "clicks" && (
          <div className="space-y-4" data-testid="affiliate-clicks">
            {clicksLoading ? (
              <p className="text-sm text-glacier py-16 text-center">{L("Chargement…", "Loading…")}</p>
            ) : !clicks ? (
              <p className="text-sm text-glacier py-16 text-center">{L("Aucune donnée d'attribution.", "No attribution data.")}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Kpi icon={CursorClick} accent="#00B8D4"
                    label={L("Clics (30 j)", "Clicks (30d)")} value={int(clicks.total_clicks)}
                    sub={`${int(clicks.active_affiliates)} ${L("affiliés actifs", "active affiliates")}`} />
                  <Kpi icon={Smartphone} accent="#2E9E6B"
                    label={L("Taux de conversion", "Conversion rate")}
                    value={attr.conversion_rate != null ? `${(attr.conversion_rate * 100).toFixed(1)}%` : "—"}
                    sub={L("commandes / clics", "orders / clicks")} />
                  <Kpi icon={Globe} accent="#E8A33D"
                    label={L("Meilleure page", "Top page")}
                    value={clicks.top_pages?.[0]?.source === "direct" ? L("Accès direct", "Direct") : clicks.top_pages?.[0]?.source || "—"}
                    sub={clicks.top_pages?.[0] ? int(clicks.top_pages[0].clicks) : ""} />
                  <Kpi icon={Users} accent="#00B8D4"
                    label={L("Conversions (30 j)", "Conversions (30d)")}
                    value={int(clicks.conversions_30d)}
                    sub={clicks.total_clicks && clicks.conversions_30d
                      ? `${((clicks.conversions_30d / clicks.total_clicks) * 100).toFixed(1)}% ${L("taux", "rate")}`
                      : "—"} />
                </div>

                <div className="bg-white border border-ash rounded-xl p-5">
                  <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier mb-4">
                    {L("CLICS — 30 DERNIERS JOURS", "CLICKS — LAST 30 DAYS")}
                  </p>
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer>
                      <LineChart data={clicks.trend || []} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B" }}
                          tickFormatter={(d) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10, fill: "#64748B" }} allowDecimals={false} />
                        <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString()} />
                        <Line type="monotone" dataKey="clicks" name={L("Clics", "Clicks")}
                          stroke="#00B8D4" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <AdminSourcesCard icon={Globe} title={L("PAGES D'ATTERRISSAGE", "LANDING PAGES")} L={L}
                    rows={clicks.top_pages} />
                  <AdminSourcesCard icon={MousePointerClick} title={L("RÉFÉRENTS", "REFERRERS")} L={L}
                    rows={clicks.top_referrers} />
                  <AdminDevicesCard devices={clicks.devices} L={L} />
                </div>

                <div className="bg-white border border-ash rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-ash">
                    <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">
                      {L("TOP AFFILIÉS PAR VOLUME DE CLICS", "TOP AFFILIATES BY CLICK VOLUME")}
                    </p>
                  </div>
                  {clicks.top_affiliates?.length ? (
                    <table className="w-full text-sm">
                      <tbody>
                        {clicks.top_affiliates.map((t, i) => (
                          <tr key={t.id} className="border-b border-ash/60 hover:bg-clinical/60">
                            <td className="px-5 py-3 w-10">
                              <span className="w-6 h-6 rounded-full bg-nordfjord text-white text-xs font-bold grid place-items-center">{i + 1}</span>
                            </td>
                            <td className="px-5 py-3">
                              <p className="font-medium text-nordfjord">{t.name}</p>
                              <p className="text-[11px] text-glacier font-mono">{t.code || "—"}</p>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => setDetail(t.id)}
                                className="text-xs text-nova hover:underline">{L("Détails", "Details")}</button>
                            </td>
                            <td className="px-5 py-3 text-right text-nordfjord tabular-nums">{int(t.clicks)} {L("clics", "clicks")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-sm text-glacier py-10 text-center">{L("Aucun clic.", "No clicks.")}</p>}
                </div>
              </>
            )}
          </div>
        )}
```

**Prérequis** : `const attr = ov?.attribution || {};` doit exister dans le composant.

#### g) Liste — colonne Clics, filtres, pagination

- Onglets : `overview`, `clicks`, `payouts` (ajouter l'onglet Attribution).
- Bloc recherche + filtres avec `data-testid="affiliate-search"`, `affiliate-filter-status`, `affiliate-filter-tier`.
- Colonne Clics dans le `<thead>` + `<td>` :
```jsx
                        <td className="px-4 py-3 text-right text-glacier tabular-nums">
                          {a.clicks ? (
                            <span title={a.last_click_at ? `${L("Dernier clic", "Last click")}: ${fmtDate(a.last_click_at)}` : ""}>
                              {int(a.clicks)}
                            </span>
                          ) : "—"}
                        </td>
```
- Remplacer `rows` par `filteredRows` / `affPageRows` ; ajouter `<AdminPagination page={affPage} total={filteredRows.length} onChange={setAffPage} L={L} />`.
- Paiements : bouton CSV `exportPayoutsAll`, mapper `payPageRows`, `<AdminPagination page={payPage} ...>`.

#### h) Composants annexes (ajouter au niveau module)

```jsx
function AdminSourcesCard({ icon: Icon, title, rows, L }) {
  const max = rows?.[0]?.clicks || 1;
  return (
    <div className="bg-white border border-ash rounded-xl p-5">
      <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier mb-4 flex items-center gap-2">
        <Icon size={14} /> {title}
      </p>
      {!rows || rows.length === 0 ? (
        <p className="text-sm text-glacier">{L("Aucune donnée.", "No data.")}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.source} className="flex items-center gap-2">
              <span className="text-xs text-nordfjord w-[130px] truncate" title={r.source}>
                {r.source === "direct" ? L("Accès direct", "Direct") : r.source}
              </span>
              <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
                <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (r.clicks / max) * 100)}%` }} />
              </div>
              <span className="text-xs text-glacier tabular-nums w-8 text-right">{int(r.clicks)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminDevicesCard({ devices, L }) {
  const labels = DEVICE_LABELS(L);
  const entries = Object.entries(devices || {}).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <div className="bg-white border border-ash rounded-xl p-5">
      <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier mb-4 flex items-center gap-2">
        <Smartphone size={14} /> {L("APPAREILS", "DEVICES")}
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-glacier">{L("Aucune donnée.", "No data.")}</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([k, n]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-xs text-nordfjord w-[130px] truncate">{labels[k] || k}</span>
              <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
                <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (n / total) * 100)}%` }} />
              </div>
              <span className="text-xs text-glacier tabular-nums w-8 text-right">{Math.round((n / total) * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 5. TESTS — `backend/tests/test_iter12_affiliate.py` (REMPLACEMENT COMPLET)

> Coller ce fichier entier dans `backend/tests/test_iter12_affiliate.py`.

```python
"""NORDPEP iteration 12 — affiliate program (dashboard data + admin controls).

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

ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

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


def _register(email):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"email": email, "password": "Affiliate2026!",
                     "name": "Affiliate Tester"}, timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    body = r.json()
    raw = body.get("debug_magic_token")
    assert raw, "register: no debug_magic_token — set MAGIC_LINK_DEBUG=1 in backend env"
    vr = s.post(f"{BASE_URL}/api/auth/magic/verify", json={"token": raw}, timeout=20)
    assert vr.status_code == 200, f"magic verify failed: {vr.status_code} {vr.text}"
    tok = s.cookies.get("access_token")
    assert tok, "magic verify: no access_token cookie"
    return tok


def _invite(admin_tok, email):
    r = requests.post(f"{BASE_URL}/api/admin/affiliates/invite",
                      headers={"Authorization": f"Bearer {admin_tok}"},
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
    """Crée un affilié actif frais : invite admin -> registre -> join."""
    email = f"iter12_{uuid.uuid4().hex[:8]}@example.com"
    token = _invite(admin_tok, email)
    user_tok = _register(email)
    r = requests.post(f"{BASE_URL}/api/affiliate/join",
                      headers={"Authorization": f"Bearer {user_tok}"},
                      json={"token": token, "payout_address": "", "payout_currency": "btc"},
                      timeout=20)
    assert r.status_code == 200, f"join failed: {r.status_code} {r.text}"
    me = requests.get(f"{BASE_URL}/api/affiliate/me",
                      headers={"Authorization": f"Bearer {user_tok}"}, timeout=20)
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
    h = {"Authorization": f"Bearer {affiliate['user_tok']}"}
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
    h = {"Authorization": f"Bearer {admin_tok}"}
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
    h = {"Authorization": f"Bearer {admin_tok}"}
    aid = affiliate["me"]["id"]

    # Applique un palier manuel
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"manual_tier": "gold"}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("manual_tier") == "gold"

    # L'affilié voit le palier forcé + flag
    me = requests.get(f"{BASE_URL}/api/affiliate/me",
                      headers={"Authorization": f"Bearer {affiliate['user_tok']}"}, timeout=20)
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
                      headers={"Authorization": f"Bearer {affiliate['user_tok']}"}, timeout=20)
    assert me.status_code == 200
    j = me.json()
    assert j["tier_is_manual"] is False
    assert j["manual_tier"] is None
    assert j["tier"] in VALID_TIERS


def test_manual_tier_validation_rejects_unknown(admin_tok, affiliate):
    h = {"Authorization": f"Bearer {admin_tok}"}
    aid = affiliate["me"]["id"]
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"manual_tier": "not-a-tier"}, timeout=20)
    assert r.status_code == 400, f"expected 400 for invalid manual_tier, got {r.status_code} {r.text}"


# ----------------------- record editing + coupon resync -----------------------
def test_admin_record_edit_and_coupon_resync(admin_tok, affiliate):
    """Code promo mémorisable + rabais par affilié : la fiche est modifiée ET le
    coupon promo est resynchronisé (code + valeur), visible côté admin et affilié."""
    h = {"Authorization": f"Bearer {admin_tok}"}
    aid = affiliate["me"]["id"]
    old_code = affiliate["me"].get("code") or ""
    new_code = "JULIE15"

    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h,
                     json={"code": new_code, "coupon_percent": 15,
                           "payout_address": "bc1qtest0000000000000000000000000test0",
                           "payout_currency": "btc", "suspension_reason": ""},
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
    assert aff["payout_address"].startswith("bc1qtest")

    # Le coupon promo est resynchronisé : même code + même valeur
    r = requests.get(f"{BASE_URL}/api/admin/coupons", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    coupons = {c.get("code"): c for c in (r.json() if isinstance(r.json(), list) else r.json().get("coupons", []))}
    assert new_code in coupons, f"coupon {new_code} not found in {list(coupons)}"
    assert float(coupons[new_code].get("value", 0)) == pytest.approx(15.0)
    assert coupons[new_code].get("affiliate_id") == aid

    # L'affilié voit son code promo + le rabais effectif
    me = requests.get(f"{BASE_URL}/api/affiliate/me",
                      headers={"Authorization": f"Bearer {affiliate['user_tok']}"}, timeout=20)
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
    h = {"Authorization": f"Bearer {admin_tok}"}
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
    assert r.status_code == 400, f"expected 400 for coupon_percent > 100, got {r.status_code} {r.text}"
    r = requests.put(f"{BASE_URL}/api/admin/affiliates/{aid}",
                     headers=h, json={"coupon_percent": -5}, timeout=20)
    assert r.status_code == 400, f"expected 400 for coupon_percent < 0, got {r.status_code} {r.text}"


def test_admin_invite_with_memorable_code(admin_tok):
    """L'invitation peut fixer d'emblée un code promo mémorisable + rabais."""
    email = f"iter12_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/admin/affiliates/invite",
                      headers={"Authorization": f"Bearer {admin_tok}"},
                      json={"email": email, "name": "Invite Memo",
                            "lang": "fr", "code": "NORD10", "coupon_percent": 10},
                      timeout=20)
    assert r.status_code == 200, r.text
    link = r.json().get("invite_link", "")
    token = link.split("token=", 1)[1] if "token=" in link else ""
    assert token
    user_tok = _register(email)
    r = requests.post(f"{BASE_URL}/api/affiliate/join",
                      headers={"Authorization": f"Bearer {user_tok}"},
                      json={"token": token, "payout_address": "", "payout_currency": "btc"},
                      timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("code") == "NORD10", f"expected code NORD10, got {j.get('code')}"
    assert j.get("coupon_percent") == pytest.approx(10.0)


# ----------------------- sources, activité, garde-fou trimestriel -----------------------
def test_affiliate_clicks_sources_shape(affiliate):
    h = {"Authorization": f"Bearer {affiliate['user_tok']}"}
    r = requests.get(f"{BASE_URL}/api/affiliate/clicks/sources", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    s = r.json()
    for k in ("days", "total_clicks", "top_pages", "top_referrers", "devices"):
        assert k in s, f"sources missing {k}"
    for item in s["top_pages"]:
        assert "source" in item and "clicks" in item


def test_affiliate_activity_feed_shape(affiliate):
    h = {"Authorization": f"Bearer {affiliate['user_tok']}"}
    r = requests.get(f"{BASE_URL}/api/affiliate/activity", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    feed = r.json()
    assert isinstance(feed, list)
    for e in feed:
        assert e["type"] in ("click", "referral", "payout")
        assert "at" in e


def test_affiliate_me_quarter_guard(affiliate):
    h = {"Authorization": f"Bearer {affiliate['user_tok']}"}
    r = requests.get(f"{BASE_URL}/api/affiliate/me", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("quarter_target", "quarter_progress", "quarter_warning", "next_review"):
        assert k in j, f"/affiliate/me missing {k}"
    assert isinstance(j["quarter_warning"], bool)


def test_admin_clicks_analytics_and_list(admin_tok):
    h = {"Authorization": f"Bearer {admin_tok}"}
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
```

---

## 6. COMMANDES DE VALIDATION

### Backend
```bash
cd backend
python -c "import ast; ast.parse(open('server.py', encoding='utf-8').read()); print('AST OK')"
python -c "import server; print('import OK')"
```

### Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm run build   # attendu : "Compiled successfully"
```

### Tests
```bash
cd backend
MAGIC_LINK_DEBUG=1 pytest tests/test_iter12_affiliate.py -v
# requis : uvicorn server:app démarré, Mongo accessible, REACT_APP_BACKEND_URL défini
```

---

## 7. RÈGLES DE NON-RÉGRESSION

- Ne supprimer aucun endpoint existant (les ajouts ci-dessus viennent en plus).
- Ne supprimer aucun `data-testid` existant.
- Tout texte affiché doit passer par `L(fr, en)`.
- Aucun nouveau paquet backend ; frontend : uniquement `qrcode.react`.
