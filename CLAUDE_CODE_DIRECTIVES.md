# Claude Code — Directives détaillées

> **Contexte** : Application e-commerce peptides FIRONOVA (ex-NORDPEP).
> Stack : FastAPI + Motor (async MongoDB) / React CRA + Tailwind + Shadcn UI.
> Bilingue FR/EN. Auth : httpOnly cookies + CSRF Origin guard.
> **Ne modifie JAMAIS** `frontend/.env` (`REACT_APP_BACKEND_URL`) ni les variables `MONGO_URL` / `DB_NAME` du `backend/.env`.

---

## 🎯 Task A — Refactor `backend/server.py` (14 900 lignes → architecture `services/`)

### Objectif
Casser le monolithe sans casser une seule route ni un seul test. Chaque service devient importable depuis `backend/routers/*.py` **et** depuis `server.py` (compat rétro).

### Résultat attendu
```
backend/
├── server.py                  # ~2 500 lignes max — bootstrap FastAPI, DB, startup tasks, routers include
├── services/
│   ├── __init__.py
│   ├── mail.py                # Resend, _send_email, outbox worker + janitor, templates HTML brandés
│   ├── canada_post.py         # génération labels, tracking sync, webhook parser
│   ├── interac.py             # Microsoft Graph, autoconfirm, INTERAC_TRUSTED_SENDER
│   ├── nowpayments.py         # invoice creation, IPN verification, mass payouts JWT
│   ├── affiliate.py           # payouts, referrals, aliases, deferral notifications
│   ├── stock.py               # restock, adjustments, low stock alerts, movements audit
│   ├── checkout.py            # CompensationContext, saga, reconciliation ledger
│   ├── address.py             # Google Maps Address Validation
│   ├── auth.py                # login, register, JWT/cookie, brute force, admin gate
│   ├── coupons.py             # apply, validate, constraints, sale dates
│   ├── refunds.py             # request → decision → 4 emails workflow
│   └── shared.py              # PyObjectId, BaseDocument, datetime helpers, PUBLIC_BASE_URL
└── models/
    ├── __init__.py
    └── product.py, order.py, user.py, affiliate.py, coupon.py, refund.py, stock.py
```

### Contraintes ABSOLUES (à ne surtout pas casser)

1. **Le `CompensationContext` de checkout** (saga pattern qui simule les transactions Mongo mononode). Il vit actuellement dans `server.py` autour des lignes du `POST /api/checkout`. Ce code est **critique** — extrais-le dans `services/checkout.py` intégralement, ne le simplifie pas.

2. **Les cookies httpOnly + CSRF Origin** : ne repasse **jamais** à `localStorage` + `Authorization: Bearer`. Le flux actuel utilise `access_token` en cookie HTTP-only + validation stricte de l'`Origin` header sur toutes les mutations. Voir `middlewares/csrf.py` et `services/auth.py` (à extraire).

3. **Les 3 API keys utilisateur actives** dans `backend/.env` : Google Maps, Microsoft Graph, NOWPayments. **Ne touche pas au `.env`**. Lis via `os.environ.get()`.

4. **Résilience à la panne Mongo** : le pod est un cluster mononode, donc pas de vraie transaction ACID. Le code utilise `CompensationContext` pour un fallback saga. Garde ce mécanisme.

5. **Pydantic v2** : `field_validator` (pas `validator`), `model_config = ConfigDict(...)` (pas `class Config`).

6. **DateTime** : toujours `datetime.now(timezone.utc)` — jamais `datetime.utcnow()`.

### Méthode recommandée (order-of-operations)

Extrais **service par service**, avec commit + `pytest` vert entre chaque.

**Ordre d'extraction suggéré (du moins risqué au plus risqué)** :

1. **`services/shared.py`** — helpers utilitaires (`PyObjectId`, `BaseDocument`, `to_iso`, `PUBLIC_BASE_URL`, `SENDER_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, etc.). Aucune logique métier, juste des constantes et helpers.
   → `pytest tests/ -x` doit rester vert.

2. **`services/mail.py`** — tout ce qui touche Resend :
   - `_send_email(to, subject, html, from_email?)`
   - `_process_email_outbox_job()`
   - `_email_outbox_worker()`
   - `_email_outbox_janitor()`, `_email_outbox_janitor_tick()`
   - `admin_email_outbox_stats()`, `admin_email_requeue()`
   - Toutes les fonctions `*_email_html(...)` qui buildent le HTML brandé
   - Constantes : `RESEND_API_KEY`, `EMAIL_JANITOR_INTERVAL_S`, `EMAIL_FAILED_RETRY_AFTER_S`, `EMAIL_JANITOR_MAX_PER_TICK`
   → `pytest tests/test_email_*.py` doit rester vert.

3. **`services/stock.py`** — restock + adjustments + low stock :
   - `admin_adjust_stock`, `admin_bulk_restock`, `admin_bulk_restock_csv`
   - `_check_low_stock_alerts`, `_send_low_stock_admin_email`
   - `admin_list_low_stock_alerts`, `admin_product_stock_history`
   - `_maybe_notify_restock`, `_restock_order_items`
   - Modèles Pydantic : `StockAdjustIn`, `StockRestockDeltaIn`, `StockRestockIn`, `StockBulkRestockRowIn`, `StockBulkRestockIn`
   → `pytest tests/test_affiliate_payout_threshold.py tests/test_sprint5_affiliate_e2e.py -v` (indirect coverage).

4. **`services/affiliate.py`** — logique affiliés :
   - `admin_affiliate_run_payouts`, `_generate_payouts_for_period`
   - `_defer_affiliate_payout_below_threshold`
   - `admin_affiliate_batch_payout`, `admin_affiliate_force_run_payouts`
   - Alias, referrals, marks, coupon syncing
   - Constantes : `AFFILIATE_PAYOUT_CURRENCIES`, `AFFILIATE_PAYOUT_MIN_CAD`
   → `pytest tests/test_sprint5_affiliate_e2e.py tests/test_iter22_affiliate_admin_update.py tests/test_affiliate_payout_threshold.py -v`

5. **`services/address.py`** — Google Maps AVS wrapper.
   → `pytest tests/test_address_validation.py -v`

6. **`services/canada_post.py`** — Canada Post integration :
   - Genération labels, PDF handling, tracking sync, `_cancel_shipping_label`

7. **`services/interac.py`** — Microsoft Graph autoconfirm :
   - `_graph_authenticate`, `_graph_fetch_messages`, `_interac_autoconfirm_loop`

8. **`services/nowpayments.py`** — Crypto payments :
   - Invoice creation, IPN handler + signature verification, mass payouts JWT auth

9. **`services/coupons.py`** — coupons apply/validate/constraints.

10. **`services/refunds.py`** — refund workflow.

11. **`services/checkout.py`** — **DERNIER** (le plus risqué) :
    - `CompensationContext` en entier
    - `POST /api/checkout` logic (sans les décorateurs FastAPI qui restent dans `routers/`)
    - `_cancel_order_side_effects`, `cancel_stale_unpaid_orders`, `_unpaid_orders_watchdog`
    → `pytest tests/test_checkout_reconciliation.py -v`

12. **`services/auth.py`** — auth login/register/JWT/admin-gate. Fait ça en dernier car ça touche tous les autres.

### Pattern d'extraction (exemple pour `mail.py`)

```python
# backend/services/mail.py
import os, uuid, asyncio, logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel, Field

# Import DB depuis le server bootstrap (à définir dans __init__.py ou depuis un module db.py dédié)
from .. import server  # évite les imports circulaires

async def send_email(to: str, subject: str, html: str, from_email: Optional[str] = None) -> None:
    ...

# Puis dans server.py, réexport pour compat rétro :
from services.mail import send_email as _send_email  # noqa: F401
```

**Alternative propre** : crée `backend/db.py` qui contient `client, db, MONGO_URL, DB_NAME` et que tous les services importent. Ça élimine le risque d'import circulaire.

### Router structure (routers/ existent déjà)
Les routers dans `backend/routers/*.py` doivent simplement importer les fonctions depuis `services/*` :
```python
# backend/routers/admin_commerce.py
from services.stock import admin_bulk_restock as svc_admin_bulk_restock

@router.post("/admin/products/{product_id}/restock")
async def admin_bulk_restock(...):
    return await svc_admin_bulk_restock(...)
```

### Critères de succès
- [ ] `backend/server.py` fait < 2 500 lignes
- [ ] `pytest tests/ -v` : 42+ tests verts (comme avant refactor)
- [ ] Preview manuelle : login admin, product page, checkout → OK
- [ ] `git log` propre avec 12 commits nommés `refactor(services/mail): extract`, etc.
- [ ] Aucun `TODO`, aucun `# will fix later`, aucun code mort

### Avant de commencer
```bash
cd /path/to/repo
git checkout -b refactor/services-extraction
python -m pytest backend/tests/ -v > /tmp/baseline.txt  # Baseline verte
```

Si un test fail avant même que tu commences : STOP, corrige, puis commence le refactor.

---

## 🎯 Task B — Admin Email Panel (screen visible)

### Objectif
Nouvelle page `/ops-portal-fn7k2q/emails` dans l'admin qui donne visibilité + contrôle total sur la file email Resend.

### À créer

**Backend** — 2 nouveaux endpoints (existants : `outbox-stats`, `requeue` bulk) :

1. **`GET /api/admin/emails/list`** — table paginée
   - Query params : `?status=failed&limit=50&page=0&q=free-text-search`
   - `status` : `pending | retry | sending | sent | failed | cancelled` (multi via `?status=failed&status=retry`)
   - Retour : `{items: [...], total: N, page, limit, has_more}`
   - **Masque `html`** par défaut (payload lourd). Retourne juste `to, from, subject, status, attempts, error_type, created_at, id`.
   - Champ `to` **redacté** en base : `t***@d***.com` (privacy).

2. **`GET /api/admin/emails/{id}`** — détail single email
   - Retourne le doc complet INCLUANT `html` rendu (pour drawer preview).
   - `to` en clair ici (admin authentifié).

3. **`POST /api/admin/emails/{id}/retry`** — rejeu unitaire
   - Reset : `status=retry, attempts=0, available_at=now, requeued_by=admin, requeued_at=now`
   - 404 si id introuvable.

4. **`POST /api/admin/emails/{id}/cancel`** — abandon manuel
   - Set `status=cancelled`. Le janitor ne re-rejoue plus les cancelled.
   - Modifier le janitor pour skip `cancelled` explicitement (déjà safe car il ne cible que `sending`/`failed`).

### Où le mettre côté backend
Après refactor : `services/mail.py` pour la logique + `routers/admin_commerce.py` pour les routes.

### Frontend — `AdminEmails.jsx`

**Fichier** : `frontend/src/pages/admin/sections/AdminEmails.jsx`

**Ajouter dans** :
- `frontend/src/pages/admin/AdminLayout.jsx` → nouvelle entrée sidebar section OPS (à côté de "Subscribers" ou "Checkout Failures") : `{ path: 'emails', label: 'Emails', icon: Mail, testid: 'admin-nav-emails' }`
- `frontend/src/App.jsx` (ou `AdminRouter`) → route `emails` → `<AdminEmails />`

**Layout** :

```
┌────────────────────────────────────────────────────────────────────┐
│  // EMAIL OUTBOX                              [Auto-refresh: ON ⚡] │
│  Live health of the transactional email queue.                     │
├────────────────────────────────────────────────────────────────────┤
│  [🟢 Sent   349]  [🟡 Retry  12]  [🔴 Failed 165]  [⚙️ Janitor 4:32]│
│                                                                    │
│  ⚠ Oldest active job: 3h 42min (retry) — worker may be behind     │
├────────────────────────────────────────────────────────────────────┤
│  Filters: [Status ▾] [Date range ▾] [Search subject/email...]      │
│  Bulk:  [Retry all failed] [Unstick stuck] [Export CSV failed]     │
├────────────────────────────────────────────────────────────────────┤
│ Date      │ Status │ To         │ Subject       │ Att │ Actions   │
│ 8/15 3:12 │ ●failed│ t***@g***  │ Order confirm │ 5   │ 🔁 👁 🚫  │
│ ...                                                                │
└────────────────────────────────────────────────────────────────────┘
```

**KPIs à afficher** (source : `GET /admin/emails/outbox-stats` toutes les 15s) :
- `Sent` (counts.sent) — vert
- `Retry` (counts.retry + counts.pending + counts.sending) — jaune si > 0
- `Failed` (counts.failed) — rouge si > 0
- Prochain tick janitor (calculé côté client : `janitor_interval_s - (Date.now() - lastFetch)`)
- Alerte orange si `oldest_active_age_seconds > 1800` (30 min)

**Bouton par ligne** :
- 🔁 **Retry** — `POST /admin/emails/{id}/retry` puis refresh
- 👁 **View** — ouvre un drawer à droite avec le HTML rendu (via `iframe srcdoc` sandboxé) + metadata (attempts, error_type, tags)
- 🚫 **Cancel** — `POST /admin/emails/{id}/cancel` avec `confirm()`

**Bouton bulk** :
- `Retry all failed` — `POST /admin/emails/requeue` `{scope: "failed", max: 500}`
- `Unstick stuck` — `POST /admin/emails/requeue` `{scope: "stuck", max: 500}`
- `Export CSV failed` — client-side depuis la liste courante filtrée

**Testids à ajouter** :
- `admin-emails-panel`
- `admin-emails-kpi-sent`, `admin-emails-kpi-retry`, `admin-emails-kpi-failed`
- `admin-emails-filter-status`, `admin-emails-filter-search`
- `admin-emails-bulk-retry-failed`, `admin-emails-bulk-unstick`, `admin-emails-bulk-export`
- `admin-emails-row-{id}`, `admin-emails-retry-{id}`, `admin-emails-view-{id}`, `admin-emails-cancel-{id}`
- `admin-emails-drawer-close`

**Composant réutilisable** : utilise le pattern du drawer existant dans `AdminOrders.jsx` (drawer HTML avec `iframe srcdoc` pour prévisualiser email).

### Tests à ajouter

`backend/tests/test_admin_emails_panel.py` :
- `test_list_returns_paginated` — insère 5 fake docs, appelle `?limit=2` → 2 items + `has_more=true`
- `test_list_filters_by_status` — `?status=failed` → seuls les failed
- `test_get_single_returns_html` — GET id → contient le HTML
- `test_retry_single_resets_attempts` — POST /retry → doc `status=retry, attempts=0, requeued_by=admin`
- `test_cancel_marks_cancelled` — POST /cancel → `status=cancelled`
- `test_janitor_skips_cancelled` — appel `_email_outbox_janitor_tick()` avec des cancelled présents → ne les touche pas

### Critères de succès
- [ ] Nouvelle route admin `/ops-portal-fn7k2q/emails` accessible
- [ ] KPIs live avec auto-refresh 15s (toggle on/off)
- [ ] Table paginée avec filtres statut + recherche
- [ ] 3 actions par ligne + 3 actions bulk toutes fonctionnelles
- [ ] Drawer HTML preview avec iframe sandboxé (`sandbox="allow-same-origin"`)
- [ ] Testids présents et cohérents
- [ ] 6 tests pytest verts

---

## 📋 Commandes utiles

```bash
# Lancer les tests backend
cd backend && python -m pytest tests/ -v --tb=short

# Lancer un test spécifique
python -m pytest tests/test_affiliate_payout_threshold.py -v

# Vérifier que le backend démarre
cd backend && python -c "from server import app; print(len(app.routes), 'routes')"

# Frontend dev
cd frontend && yarn start   # Port 3000

# Rechercher où une fonction est utilisée
grep -rn "admin_bulk_restock\|_send_email" backend/ --include="*.py"

# Compter les lignes de server.py
wc -l backend/server.py

# Vérifier qu'aucun import circulaire
python -c "import server; print('OK')" 2>&1 | tail -5
```

## 🚨 Red flags à surveiller

- ❌ `datetime.utcnow()` → utiliser `datetime.now(timezone.utc)`
- ❌ `class Config:` (Pydantic v1) → utiliser `model_config = ConfigDict(...)`
- ❌ `validator` (Pydantic v1) → utiliser `field_validator`
- ❌ Retourner un raw MongoDB doc avec `_id` (BSON non-JSON) → toujours `{"_id": 0}` en projection
- ❌ Modifier `frontend/.env`, `backend/.env` (MONGO_URL, DB_NAME, REACT_APP_BACKEND_URL)
- ❌ Ajouter `console.log` ou `print` de debug qui restent en prod

## 🔐 Credentials de test (`/app/memory/test_credentials.md`)
- Admin : `admin@fironova.com` / `uR8!vK3#xM9@qT6$wP2&zN7L`
- Affilié : `demo.affilie@fironova.com` / `Fironova!Demo2026`
- Admin Gate : n'importe quel texte (bypass DEV)

---

## 📤 Après avoir fini

1. `git add -A && git commit -m "refactor: extract services/* + admin email panel"`
2. `git push origin refactor/services-extraction`
3. Ouvre une PR ou merge dans `main`
4. Repull dans Emergent via le sync GitHub du chat

Bonne session !
