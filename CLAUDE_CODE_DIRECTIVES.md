# Claude Code — Directives détaillées (v2)

> **Contexte** : App e-commerce peptides FIRONOVA. FastAPI + Motor / React CRA + Tailwind + Shadcn UI.
> Bilingue FR/EN. Auth httpOnly cookies + CSRF Origin guard.
> **Refactor `services/*` DÉJÀ FAIT** — `backend/server.py` fait 11 035 lignes, `backend/services/{mail,canada_post,interac,nowpayments,affiliate,stock}.py` existent.

## ⚠️ Règles absolues
- **Jamais** toucher à `frontend/.env` (`REACT_APP_BACKEND_URL`) ni `MONGO_URL` / `DB_NAME`.
- **Jamais** repasser à `localStorage` + `Authorization: Bearer` — auth strictement `httpOnly cookies + CSRF Origin`.
- Toutes les routes API préfixées `/api/`.
- Pydantic v2 : `field_validator`, `model_config = ConfigDict()`.
- DateTime : `datetime.now(timezone.utc)` — jamais `utcnow()`.
- Ne jamais retourner un raw MongoDB doc (le `_id` BSON casse la sérialisation) — projeter `{"_id": 0}`.
- Ajouter des **data-testid** kebab-case sur tout élément interactif ou d'info critique.

---

## 🎯 Task 1 — Widget Low Stock Dashboard (P1 · ~20 min)

### Objectif
Ajouter une carte "Low Stock Alerts" sur le dashboard admin qui liste les variants dont le stock est ≤ `low_stock_threshold`. Actionnable en 1 clic vers la fiche produit.

### Contexte technique (déjà en place)
- Backend endpoint EXISTANT : `GET /api/admin/low-stock-alerts` retourne `{items: [{product_id, variant_id, stock, threshold, triggered_at, active}], count}` (filtré `active=true`).
- Le hook `_check_low_stock_alerts()` dans `services/stock.py` met à jour cette collection automatiquement à chaque restock/adjustment/CSV bulk.
- Frontend Dashboard : `/app/frontend/src/pages/admin/sections/AdminDashboard.jsx`.

### Changements demandés

**Backend** — Enrichir la réponse pour éviter des N+1 requêtes côté frontend.

Modifier `admin_list_low_stock_alerts()` dans `backend/services/stock.py` pour joindre le nom du produit et le nom du variant :

```python
async def admin_list_low_stock_alerts(_admin: dict = ...):
    docs = await db.low_stock_alerts.find({"active": True}, {"_id": 0}).sort("triggered_at", -1).to_list(500)
    # Enrichir avec product_name + variant_name via une seule query
    if not docs:
        return {"items": [], "count": 0}
    product_ids = list({d["product_id"] for d in docs})
    products = await db.products.find(
        {"id": {"$in": product_ids}},
        {"_id": 0, "id": 1, "name_en": 1, "name_fr": 1, "slug": 1, "variants.id": 1, "variants.name": 1, "variants.sku": 1},
    ).to_list(len(product_ids))
    pmap = {p["id"]: p for p in products}
    for d in docs:
        p = pmap.get(d["product_id"], {})
        d["product_name"] = p.get("name_en") or p.get("name_fr") or p.get("slug") or "?"
        d["product_slug"] = p.get("slug")
        vname = None
        vsku = None
        for v in p.get("variants") or []:
            if v.get("id") == d.get("variant_id"):
                vname = v.get("name")
                vsku = v.get("sku")
                break
        d["variant_name"] = vname
        d["variant_sku"] = vsku
    return {"items": docs, "count": len(docs)}
```

**Frontend** — Nouveau composant `LowStockCard.jsx`.

Créer `/app/frontend/src/pages/admin/sections/dashboard/LowStockCard.jsx` :

```jsx
import { useEffect, useState } from "react";
import { AlertTriangle, PackagePlus, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "../../../../lib/api";

export function LowStockCard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/low-stock-alerts");
      setItems(r.data.items || []);
      setRefreshedAt(new Date());
      setErr(null);
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // refresh 60s
    return () => clearInterval(t);
  }, []);

  const isCritical = items.some(i => (i.stock ?? 0) === 0);

  return (
    <div data-testid="low-stock-card"
         className={`bg-white border ${items.length ? (isCritical ? "border-red-300" : "border-amber-300") : "border-ink/10"} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className={items.length ? (isCritical ? "text-red-600" : "text-amber-600") : "text-foreground/40"} />
          <h3 className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/70">Low stock alerts</h3>
          {items.length > 0 && (
            <span data-testid="low-stock-count"
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 border ${isCritical ? "bg-red-100 text-red-700 border-red-300" : "bg-amber-100 text-amber-700 border-amber-300"}`}>
              {items.length}
            </span>
          )}
        </div>
        <button onClick={load} disabled={loading} data-testid="low-stock-refresh"
          className="text-foreground/50 hover:text-foreground p-1 disabled:opacity-40" title="Refresh">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {err && <p className="text-xs text-red-600" data-testid="low-stock-error">{err}</p>}
      {!err && !items.length && !loading && (
        <p className="text-xs text-foreground/50 italic" data-testid="low-stock-empty">
          All products above their low-stock threshold. ✓
        </p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-ink/5" data-testid="low-stock-list">
          {items.slice(0, 8).map((a) => {
            const critical = (a.stock ?? 0) === 0;
            return (
              <li key={`${a.product_id}-${a.variant_id || "root"}`}
                  data-testid={`low-stock-row-${a.product_slug}-${a.variant_sku || "root"}`}
                  className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{a.product_name}</div>
                  <div className="text-[11px] font-mono text-foreground/60 truncate">
                    {a.variant_name || "—"} {a.variant_sku && <span className="text-foreground/40">· {a.variant_sku}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`font-mono font-bold text-sm ${critical ? "text-red-700" : "text-amber-700"}`}
                        data-testid={`low-stock-qty-${a.product_slug}-${a.variant_sku || "root"}`}>
                    {a.stock}
                  </span>
                  <span className="font-mono text-[10px] text-foreground/50"> / {a.threshold}</span>
                </div>
                <Link to={`/ops-portal-fn7k2q/products?highlight=${a.product_slug}`}
                      data-testid={`low-stock-goto-${a.product_slug}`}
                      className="p-1.5 border border-ink/20 hover:bg-ink hover:text-white transition-colors" title="Open product">
                  <ExternalLink size={11} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 8 && (
        <Link to="/ops-portal-fn7k2q/products" data-testid="low-stock-see-all"
              className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 hover:underline">
          See all {items.length} alerts →
        </Link>
      )}

      {refreshedAt && (
        <p className="mt-3 text-[10px] font-mono text-foreground/40" data-testid="low-stock-refreshed-at">
          Refreshed {refreshedAt.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
```

Puis dans `AdminDashboard.jsx` :
1. `import { LowStockCard } from "./dashboard/LowStockCard";`
2. Ajouter `<LowStockCard />` dans la grille de widgets, idéalement en haut à droite ou dans la 2e ligne — position visible mais pas dominante.

### Bonus : Ping visuel dans la sidebar
Dans `AdminLayout.jsx`, à côté de "Products", afficher un badge rouge/ambre avec le nombre d'alertes actives :
- Poller le même endpoint `/admin/low-stock-alerts` toutes les 60s au niveau layout (via un simple hook)
- Afficher un `<span>` badge si `count > 0`, `data-testid="sidebar-low-stock-badge"`

### Tests
`backend/tests/test_low_stock_endpoint.py` :
- `test_returns_active_alerts_enriched` : insère un product+variant, insère un alert `active=true`, GET → item enrichi avec `product_name, variant_name, variant_sku`
- `test_filters_out_cleared_alerts` : un alert `active=false` ne doit pas apparaître
- `test_empty_when_no_alerts` : count=0, items=[]

### Critères de succès
- [ ] Widget visible sur `/ops-portal-fn7k2q` (dashboard)
- [ ] Auto-refresh 60s avec indicateur
- [ ] Bordure rouge si stock=0 quelque part, ambre sinon, ink/10 si vide
- [ ] Chaque ligne ouvre la fiche produit en 1 clic
- [ ] Badge sidebar visible si alerts > 0
- [ ] 3 tests pytest verts

---

## 🎯 Task 2 — Admin Email Panel (P1 · ~40 min)

### Objectif
Nouvelle page `/ops-portal-fn7k2q/emails` : visibilité + contrôle total de la file email Resend.

### Backend — 3 nouveaux endpoints

Ajouter dans `backend/services/mail.py` (les fonctions), puis exposer via `backend/routers/admin_commerce.py` (routes) :

1. **`GET /api/admin/emails/list`** — table paginée
   ```python
   async def admin_email_list(status: Optional[str] = None, q: Optional[str] = None,
                              page: int = 0, limit: int = 50,
                              _admin: dict = ...):
       page = max(0, int(page))
       limit = max(1, min(int(limit), 200))
       filt = {}
       if status:
           statuses = [s.strip() for s in status.split(",") if s.strip()]
           filt["status"] = {"$in": statuses}
       if q:
           filt["$or"] = [
               {"subject": {"$regex": q, "$options": "i"}},
               {"to": {"$regex": q, "$options": "i"}},
           ]
       total = await db.email_outbox.count_documents(filt)
       cursor = db.email_outbox.find(filt, {"_id": 0, "html": 0}).sort("created_at", -1).skip(page * limit).limit(limit)
       raw = await cursor.to_list(limit)
       # Redact email addresses in the list view
       for doc in raw:
           to = doc.get("to")
           if isinstance(to, list):
               doc["to"] = [_redact_email(x) for x in to]
           elif isinstance(to, str):
               doc["to"] = _redact_email(to)
       return {"items": raw, "total": total, "page": page, "limit": limit,
               "has_more": (page + 1) * limit < total}


   def _redact_email(email: str) -> str:
       if not email or "@" not in email:
           return "***"
       local, domain = email.split("@", 1)
       return f"{local[:1]}***@{domain[:1]}***.{domain.rsplit('.', 1)[-1] if '.' in domain else '***'}"
   ```

2. **`GET /api/admin/emails/{email_id}`** — détail single (avec HTML rendu, email en clair)
   ```python
   async def admin_email_get(email_id: str, _admin: dict = ...):
       doc = await db.email_outbox.find_one({"id": email_id}, {"_id": 0})
       if not doc:
           raise HTTPException(404, "Email not found")
       return doc
   ```

3. **`POST /api/admin/emails/{email_id}/retry`** — rejeu unitaire
   ```python
   async def admin_email_retry_single(email_id: str, _admin: dict = ...):
       now_iso = datetime.now(timezone.utc).isoformat()
       res = await db.email_outbox.update_one(
           {"id": email_id},
           {"$set": {"status": "retry", "attempts": 0, "available_at": now_iso,
                     "requeued_at": now_iso, "requeued_by": "admin_single"},
            "$unset": {"lease_expires_at": ""}}
       )
       if res.matched_count == 0:
           raise HTTPException(404, "Email not found")
       return {"ok": True}
   ```

4. **`POST /api/admin/emails/{email_id}/cancel`** — abandon manuel
   ```python
   async def admin_email_cancel(email_id: str, _admin: dict = ...):
       res = await db.email_outbox.update_one(
           {"id": email_id},
           {"$set": {"status": "cancelled",
                     "cancelled_at": datetime.now(timezone.utc).isoformat(),
                     "cancelled_by": "admin"}}
       )
       if res.matched_count == 0:
           raise HTTPException(404, "Email not found")
       return {"ok": True}
   ```

**Modifier le janitor** dans `services/mail.py` pour skip explicitement les cancelled (déjà safe car il ne cible que `sending` avec lease expiré ou `failed`, mais vérifier qu'aucun update ne ré-inclut les cancelled).

### Frontend — Nouvelle page `AdminEmails.jsx`

Fichier : `/app/frontend/src/pages/admin/sections/AdminEmails.jsx`

**Registration** :
- `AdminLayout.jsx` : nouvelle entrée sidebar section OPS, à côté de "Subscribers" — `{ path: 'emails', label: 'Emails', icon: Mail, testid: 'admin-nav-emails' }`
- `App.jsx` (ou routeur admin) : route `emails` → `<AdminEmails />`

**Layout ASCII** :
```
┌────────────────────────────────────────────────────────────────────────┐
│  // EMAIL OUTBOX                             Auto-refresh: [ON ⚡]     │
├────────────────────────────────────────────────────────────────────────┤
│  [🟢 Sent 349] [🟡 Retry 12] [🔴 Failed 165] [⚙️ Next janitor: 4:32]   │
│  ⚠ Oldest active: 3h 42min · avg attempts on failed: 5.0               │
├────────────────────────────────────────────────────────────────────────┤
│  Filters: [Status ▾] [Search subject/email…]                           │
│  Bulk:    [Retry all failed] [Unstick stuck] [Export CSV]              │
├────────────────────────────────────────────────────────────────────────┤
│ Date       │ Status  │ To          │ Subject       │ Att │ Actions    │
│ 8/15 3:12  │ ●failed │ t***@g***   │ Order confirm │ 5   │ 🔁 👁 🚫   │
│ ...                                                                    │
│ [◀ Prev]                     Page 1 / 4                    [Next ▶]   │
└────────────────────────────────────────────────────────────────────────┘
```

**Composants clés** :
- **KPI Cards** (source : `GET /admin/emails/outbox-stats` — existant) toutes les 15s si auto-refresh ON
- **Table paginée** : `GET /admin/emails/list?status=&q=&page=&limit=50`
- **Filtres** : multi-select statut (chips), input recherche debounced 400ms
- **Actions bulk** :
  - Retry all failed : `POST /admin/emails/requeue` `{scope:"failed", max: 500}` avec `confirm()`
  - Unstick stuck : `POST /admin/emails/requeue` `{scope:"stuck", max: 500}` avec `confirm()`
  - Export CSV : depuis la liste courante (client-side)
- **Actions par ligne** :
  - 🔁 Retry : `POST /admin/emails/{id}/retry`
  - 👁 View : ouvre un drawer à droite avec `<iframe srcDoc={html} sandbox="allow-same-origin" />`
  - 🚫 Cancel : `POST /admin/emails/{id}/cancel` avec `confirm()`

**Alertes visuelles** :
- Bandeau orange si `oldest_active_age_seconds > 1800` (30 min)
- Bandeau rouge si `counts.failed > 100`

**Testids** :
- `admin-emails-panel`, `admin-emails-auto-refresh-toggle`
- `admin-emails-kpi-sent`, `admin-emails-kpi-retry`, `admin-emails-kpi-failed`
- `admin-emails-filter-status`, `admin-emails-filter-search`
- `admin-emails-bulk-retry-failed`, `admin-emails-bulk-unstick`, `admin-emails-bulk-export`
- `admin-emails-row-{id}`, `admin-emails-retry-{id}`, `admin-emails-view-{id}`, `admin-emails-cancel-{id}`
- `admin-emails-drawer`, `admin-emails-drawer-close`, `admin-emails-drawer-html-iframe`
- `admin-emails-pagination-prev`, `admin-emails-pagination-next`

### Tests
`backend/tests/test_admin_emails_panel.py` :
1. `test_list_paginated` : insert 5 fake docs, `?limit=2` → 2 items + `has_more=true`
2. `test_list_filter_status` : `?status=failed,retry` → seulement ces statuts
3. `test_list_redacts_recipient` : `to` = `foo@bar.com` → `f***@b***.com` dans la réponse
4. `test_get_single_returns_html` : GET id → contient `html` en clair
5. `test_retry_resets_attempts_and_status` : POST /retry → doc `status=retry, attempts=0, requeued_by=admin_single`
6. `test_cancel_marks_cancelled` : POST /cancel → `status=cancelled, cancelled_by=admin`
7. `test_janitor_skips_cancelled` : insert doc `status=cancelled, created_at=old`, appeler `_email_outbox_janitor_tick()` → doc ne change pas

### Critères de succès
- [ ] `/ops-portal-fn7k2q/emails` accessible via sidebar
- [ ] KPIs avec auto-refresh 15s (toggle)
- [ ] Table paginée + filtres + recherche fonctionnels
- [ ] Toutes les actions (bulk + par ligne) fonctionnent
- [ ] Drawer HTML preview avec iframe sandboxé
- [ ] 7 tests pytest verts

---

## 🎯 Task 3 — Fix lien COA frontend (P2 · ~10 min)

### Problème
Dans `/app/frontend/src/pages/ProductDetail.jsx` ligne 156 et 331, le lien COA utilise `coa_url` brut :
```jsx
const coaUrl = selectedVariant?.coa_url || "";
...
<a href={coaUrl} target="_blank" rel="noopener noreferrer" data-testid="download-coa" ...>
```

Or les URLs COA stockées en DB sont **relatives** (ex: `/uploads/coa/bpc-157-5mg-lot42.pdf`) depuis le fix "COA upload paths (made relative)" (voir commit `57d4b61`). En dev/preview, cliquer sur le lien tente d'ouvrir `/uploads/...` sur le frontend origin (port 3000), ce qui produit un **404**. En prod ça marche par hasard grâce au reverse proxy, mais c'est fragile.

### Fix

Utiliser `resolveAssetUrl()` (déjà importé ligne 5 : `import api, { formatApiError, resolveAssetUrl } from "../lib/api";`) pour préfixer avec `REACT_APP_BACKEND_URL`.

**Modification unique** dans `ProductDetail.jsx` :

Remplacer :
```jsx
const coaUrl = selectedVariant?.coa_url || "";
```

Par :
```jsx
const coaUrl = selectedVariant?.coa_url ? resolveAssetUrl(selectedVariant.coa_url) : "";
```

C'est tout. `resolveAssetUrl()` gère les 3 cas : URL absolue http/https (pass-through), URL relative /uploads (préfixe backend), null (empty string).

### Vérification

1. Ouvrir un produit avec COA disponible (ex : BPC-157 5mg si son variant a un `coa_status: "available"` et `coa_url` défini)
2. Cliquer sur le bouton "Download COA"
3. Le PDF s'ouvre depuis `{REACT_APP_BACKEND_URL}/uploads/coa/xxx.pdf`

### Test (optionnel — pas indispensable pour un fix aussi ciblé)
Aucun test backend nécessaire. Test manuel via preview suffit.

### Critères de succès
- [ ] Le bouton "Download COA" ouvre le PDF avec le préfixe backend
- [ ] Aucune régression sur les autres liens de la page (images, etc.)

---

## 📋 Commandes utiles

```bash
# Tests backend ciblés
cd backend && python -m pytest tests/test_low_stock_endpoint.py tests/test_admin_emails_panel.py -v

# Vérifier que le backend démarre
cd backend && python -c "from server import app; print(len(app.routes), 'routes')"

# Frontend dev
cd frontend && yarn start

# Rechercher où une fonction est utilisée
grep -rn "admin_list_low_stock_alerts" backend/ --include="*.py"

# Compter les lignes ajoutées
git diff --stat main
```

## 🔐 Credentials de test
- Admin : `admin@fironova.com` / `uR8!vK3#xM9@qT6$wP2&zN7L`
- Affilié : `demo.affilie@fironova.com` / `Fironova!Demo2026`
- Admin Gate : n'importe quel texte (bypass DEV)

## 📤 Après avoir fini
```bash
git add -A
git commit -m "feat: low-stock dashboard widget + admin email panel + fix COA frontend link"
git push origin feature/dashboard-and-email-panel
```
Puis PR vers main, merge, et repull dans Emergent via le sync GitHub.

Bonne session Claude Code ! 🚀
