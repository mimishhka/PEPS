# NORDPEP — Product Requirements Document

**Last updated**: 2026-06-29

## Original Problem Statement
E-commerce website for peptides, bilingual FR/EN, compliance-ready for Canada (NORDPEP brand).

## Stack
- Backend: FastAPI 0.110 · Motor · bcrypt · PyJWT · httpx · resend · reportlab
- Frontend: React 19 · React Router 7 · Tailwind · shadcn/ui · lucide-react · sonner
- DB: MongoDB (users, products, orders, coupons, shipping_zones, shipping_methods)

## Iteration log

### iteration_1 (MVP) — 2026-06-28
- 12 seeded peptides, FR/EN i18n, age gate 19+, JWT auth, sliding cart, QC tax demo, Interac + NOWPayments mock checkout, basic admin tabs (orders/products/customers), bilingual Compliance + Lab + About pages.

### iteration_2 — 2026-06-28
- Resend email integration (order confirmation + admin alert + payment-received).
- Removed all taxes; flat $20 CAD shipping.
- "Health Canada" wording removed (kept research-use + 19+ disclaimer).
- Hidden admin entry (footer dot) + visible ADMIN button in header (auto-login).

### iteration_3 — 2026-06-29 (current)
**Backend additions** (server.py):
- Product fields: `featured`, `preorder_allowed`, `low_stock_threshold`, `coa_url`, `coa_lot`, `coa_date`.
- Order fields: `notes[]`, `shipping_info{carrier,tracking_number,shipped_at}`, `discount`, `coupon`, `has_preorder`, `paid_at`.
- Coupon model (CRUD): code, percent/fixed, min_subtotal, usage_limit, expires_at.
- Shipping zones + methods (CRUD): Canada + International seeded with 3 default methods.
- Endpoints:
  - `POST /api/admin/orders/{id}/confirm-payment` → atomic paid + processing transition + email.
  - `POST /api/admin/orders/{id}/notes` · `PUT /admin/orders/{id}/shipping` · `PUT /admin/products/{id}/stock`.
  - `GET /api/admin/coupons` (+ POST/PUT/DELETE) · `POST /api/coupons/validate`.
  - `GET /api/admin/shipping/zones` + `methods` CRUD.
  - `GET /api/admin/analytics` (daily revenue 30d, top products, recent orders).
  - `GET /api/admin/orders.csv` + `GET /api/admin/products.csv` exports.
  - `GET /api/orders/{id}/invoice.pdf` — reportlab-generated branded invoice with NORDPEP logo, items table, totals, footer disclaimer.
- Stock auto-decrement on checkout. Coupon usage auto-increment. Pre-order line items don't decrement stock below 0.
- Payment status → "paid" automatically transitions fulfillment to "processing".
- Featured filter on `/products?featured=true`. 6 products seeded as featured.

**Frontend additions**:
- New admin layout (`/admin/*`) — WooCommerce-style sidebar nav + clean white panels.
  - Dashboard: 4 KPI cards (Revenue, Orders, Customers, Products w/ low-stock), 30-day revenue bar chart, top products, recent orders.
  - Orders: filters (search, payment, fulfillment), CSV export, click → drawer with confirm-payment button, invoice PDF download, carrier+tracking save (auto marks as shipped), payment/fulfillment selectors, internal notes thread.
  - Products: table with image, stock indicator (low/out/numeric), COA badge (Verified/Pending), Featured star, full editor drawer with Basic / Stock / COA / Visibility sections, CSV export.
  - Coupons: full CRUD with code, percent/fixed, usage limit, expiry.
  - Customers: list.
  - Shipping: zones + methods CRUD.
- Customer-side:
  - Home Featured Compounds: 3-column with `gap-8 lg:gap-12` (much more aerated), uses `featured=true` filter.
  - Product detail: green "COA Verified" / orange "COA Pending" badge linking to PDF, pre-order badge + disabled add-to-cart when out of stock.
  - Checkout: coupon code input with apply/remove, shows discount line in summary.

## Test Results
- iteration_1: 100% backend + 100% frontend pass
- iteration_2: 100% backend + 100% frontend pass
- iteration_3: pending testing-agent verification

## Prioritized Backlog
### P0 (provided keys needed)
- Resend `RESEND_API_KEY` + nordpep.ca domain verification → live emails.
- NOWPayments API key + IPN webhook for live crypto.
- Real `INTERAC_EMAIL` for actual e-Transfer recipient.

### P1
- Real Canada Post integration (Shipsy/EasyPost/Sendle) for label generation.
- COA PDF upload to object storage (currently URL field only).
- Stock back-in-stock email subscription on out-of-stock products.
- Order shipping cost computed from selected zone+method (currently flat $20).
- Brute-force lockout on login.

### P2
- Magic-link admin entry (replace credentials hardcoded in client).
- Product variants (e.g., 5mg/10mg vials).
- Loyalty / referral discounts.
- Customer accounts: saved addresses, reorder button.

## Environment Variables
- `MONGO_URL`, `DB_NAME`
- `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `INTERAC_EMAIL`, `INTERAC_PASSWORD_HINT`
- `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`
- `RESEND_API_KEY`, `SENDER_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`
- `SHIPPING_FLAT_CAD` (default 20.00)
- `REACT_APP_BACKEND_URL` (frontend)

## Admin
- Email: `admin@nordpep.ca`
- Password: `NordpepAdmin2026!`
- One-click entry via ADMIN button in header (auto-login) or hidden dot in footer.

## Update — Juin 2026 (session fork)
- Conditions Générales complètes réécrites (17 sections, inspirées de thepeptidelabs.ca sans plagiat) : acceptation, avertissements, restriction 19+, usage recherche uniquement, retours (ventes finales), engagement client, usage professionnel, obligations réglementaires (formulation neutre, sans mention Santé Canada/FDA), responsabilité acheteur, limitation de responsabilité, indemnisation, disponibilité du site, intégralité, divisibilité, titres, force majeure, reconnaissance finale. Bilingue FR/EN.
- Page /compliance renommée « Conditions Générales » (mots « Conformité » et « Légal » retirés de l'UI).
- Lien retiré du menu du haut ; accessible uniquement via le pied de page, section renommée « Informations ».
- Politique d'expédition complète ajoutée à la page Conditions Générales (section #shipping) : 7 sous-sections bilingues (livraison gratuite 200 $+, délais par région, expédition avant 14 h HE, retards, erreurs d'adresse, colis perdus, retours). Inspirée de peptidewarehouse.ca, reformulée sans plagiat.
- Page dédiée /privacy créée (Politique de confidentialité, 11 sections bilingues FR/EN inspirées de peptidewarehouse.ca, reformulées) : collecte/utilisation, données de journal, témoins, DNT, fournisseurs, communications, divulgation légale, sécurité, transfert international, liens tiers, modifications. Mention LPRPDE + Loi 25 conservée. Lien pied de page mis à jour ; ancienne section privacy retirée de /compliance.
- Page FAQ dédiée /faq créée (accordéons Shadcn, 5 catégories, 22 questions bilingues FR/EN) alignée sur les Conditions Générales, la Politique d'expédition (200 $ gratuit, 14 h HE, délais régionaux, colis perdus, erreurs d'adresse) et les paiements (Interac, NOWPayments). Sections : Expédition, Entreposage & manipulation, Paiement, Commandes/retours/remboursements, Produits & usage permis (19+, recherche uniquement, liens vers CG). Bloc contact info@nordpep.ca. Lien pied de page mis à jour ; ancienne section FAQ retirée de /compliance.
- Livraison : tarif fixe 20 $ sous 200 $, GRATUITE dès 200 $ (backend _build_order_totals + checkout frontend avec indice « plus que X $ »). Env: FREE_SHIPPING_THRESHOLD_CAD=200.
- Annulation automatique des commandes impayées après 48 h (watchdog asyncio horaire + au démarrage) : statuts cancelled, note système, remise en stock des variantes. Env: UNPAID_ORDER_TTL_HOURS=48.
- Textes mis à jour : politique d'expédition (tarif fixe + section Commandes impayées) et FAQ (2 réponses). Testé par testing_agent (iteration_5.json — 100 % backend & frontend).
- Bandeau d'avertissement rouge « Paiement requis sous 48 heures » sur la page de confirmation (Interac/crypto, masqué si payé/annulé). Validé par testing_agent (iteration_6.json, 8/8). Mention « stock réservé libéré » retirée du bandeau à la demande de l'utilisateur.
- Compte à rebours en direct sur le bandeau 48 h (« Il vous reste X h Y min pour payer », tick 30 s, message « Délai expiré » après échéance).
- NOWPayments passé en mode LIVE (clé de production fournie par l'utilisateur dans backend/.env) : vraies adresses BTC/crypto, badge DEMO retiré automatiquement. Nouveau endpoint GET /api/payments/crypto/status/{order_id} (marque payé uniquement sur statut NOWPayments 'finished', selon playbook) + polling frontend 20 s sur la page de confirmation. Testé testing_agent iteration_7.json : 100 % (10/10 backend, 6/6 frontend).
- Widget NOWPayments à montant exact : le checkout crypto crée désormais une FACTURE NOWPayments (POST /v1/invoice, montant CAD exact, ipn_callback_url) et la page de confirmation intègre le widget iframe (iid dynamique) + lien vers la page de paiement. Webhook IPN signé (HMAC-SHA512) POST /api/webhook/nowpayments : marque payé sur statut 'finished' (idempotent), note système, courriel. Secret IPN + PUBLIC_BASE_URL en backend/.env. URL webhook donnée à l'utilisateur : {PUBLIC_BASE_URL}/api/webhook/nowpayments.
- Bug corrigé (trouvé par testing_agent iteration_8) : le widget/instructions crypto et Interac sont maintenant masqués une fois la commande payée ; bandeau vert « Paiement reçu » ajouté. Backend 10/10, frontend revérifié après correctif.
- Section « Points importants / Key things to note » (4 puces bilingues : rester sur la page, montant exact avant expiration du minuteur, minimum requis, non remboursable) ajoutée sous le widget NOWPayments sur la page de confirmation. Vérifié par capture d'écran FR.


## Update — Février 2026 (session fork)
- **Générateur en masse de codes affiliés (CSV)** — Nouveau endpoint admin `POST /api/admin/affiliates/bulk-invite` accepte `{rows:[{email,name?}], lang, commission_note}` (max 500 lignes). Génère un code unique auto (`FN` + 6 caractères alphabet sûr) pour chaque nouvel affilié, ré-invite les existants en préservant leur code, envoie l'invitation via Resend, et retourne un résumé `{total, sent, skipped[], failed[], results[]}`. Validation email par regex (rejette proprement sans casser le batch). Nouvelle UI `BulkInviteModal` dans `AdminAffiliates.jsx` : dropzone CSV (glisser-déposer), parseur client-side (détection en-tête + séparateurs `,` ou `;`), preview des lignes, résultats avec KPIs (Sent/Skipped/Failed) et téléchargement CSV des codes générés. Tests : 100% backend (8/8) + 100% frontend (iteration_23.json). Fichiers pytest: `/app/backend/tests/test_bulk_invite.py`.
- **Fix ESLint v9** — Ajout d'un `eslint.config.js` (flat config) à la racine frontend pour supprimer les erreurs « JavaScript linting failed » du checker de la plateforme.
- **Auth Bearer JWT** — Documenté dans test_credentials.md : le token est retourné dans `POST /api/auth/login` (champ `access_token`) et stocké dans `localStorage.fironova_token`. L'axios interceptor injecte automatiquement `Authorization: Bearer <token>`.

## Prioritized Backlog

### P1 — À suivre
- Fix rate limiting login : lire `CF-Connecting-IP` / `X-Forwarded-For` dans `_client_ip()` au lieu de `request.client.host` (masqué par Cloudflare)

### P2 — Backlog technique
- Refactor `server.py` (10 800+ lignes) → routers modulaires (`routes/orders.py`, `routes/auth.py`, `routes/affiliates.py`, `routes/coupons.py`)
- Pages admin manquantes (`AdminSubscribers`, `AdminLayoutSettings`)


## Update — Février 2026 (session fork, suite)
- **Meilleurs produits perso pour affiliés** — Nouveau endpoint `GET /api/affiliate/top-products?limit=N` (default 5, max 20) qui agrège les items des commandes payées attribuées à l'affilié courant. Frontend `AffiliateDashboard.jsx` : appel prioritaire, fallback vers `/products?featured=true` si aucune vente. Widget mis à jour avec badge rang (1,2,3) + qté vendue + revenu généré + pluralisation FR/EN. Tests: 100% backend (6/6, `/app/backend/tests/test_affiliate_top_products_and_cf_ip.py`) + 100% frontend (iteration_24.json).
- **Fix rate limit Cloudflare** — `_client_ip()` étendu pour lire prioritairement `CF-Connecting-IP` (validée), avec fallback `X-Forwarded-For` quand le peer est en IP privée/loopback. Le compteur de brute-force sur `/api/auth/login` distingue à nouveau les vrais visiteurs derrière Cloudflare. Vérifié: 5 tentatives sur même CF-IP → 429; IP fraîche → 401.
- **AgeGate & Coupons UI** — AgeGate refondu en identité Fironova (nordfjord + nova cyan). Popup édition coupon complètement rebâti : 3 sections (Général / Limites & calendrier / Ciblage), sticky header+footer, bilingue FR/EN, testids préservés.


## Update — Août 2026 (session fork, suite : refonte onboarding affilié)
- **Invitation admin — nouveaux champs** : `first_name` + `last_name` obligatoires, `company` optionnel. Rétrocompat conservée sur `name`. Devise payout par défaut = `usdt`.
- **Activation magic-link 1-clic** (`POST /api/affiliate/join`) : plus aucune auth préalable requise. Crée le compte passwordless (email_verified=True), active l'affilié, retourne le JWT dans le body + pose cookie httpOnly. Frontend `AffiliateJoin.jsx` réécrite : auto-post du token à l'arrivée, storage `localStorage.fironova_token`, redirect `/affiliate` en 1.2s.
- **Génération de code v2** : `_affiliate_gen_code_v2(base, discount, email, exclude_id)`. Base = entreprise si fournie sinon prénom, normalisée (accents supprimés, upper, alphanum, max 6 chars). Suffixe = pourcentage entier. Anti-collision déterministe (2 chars stables du hash email) puis random en dernier recours. Ex: `MARIE10`, `FITNES10`, `MARIE10TP` pour un homonyme.
- **Rename + aliases** : quand l'admin change `coupon_percent` via `PUT /api/admin/affiliates/{id}`, le code est régénéré (nouvelle base × nouveau %), l'ancien code archivé dans `aliases[]` avec `active: true` par défaut. Attribution `?ref=<code>` accepte le code principal OU un alias actif. L'ancien coupon est désactivé (single source of truth = coupon courant). Endpoint `PUT /api/admin/affiliates/{id}/aliases/{alias_code}` pour activer/désactiver un alias individuellement.
- **Payout USDT/USDC ERC-20 uniquement** : nouvelles constantes `AFFILIATE_PAYOUT_CURRENCIES = ("usdt","usdc")`, validation Ethereum + checksum EIP-55 pure-Python (`_keccak256`, `_eth_to_checksum`, `_is_valid_eth_address`). `_normalize_payout()` lève HTTPException 422 sur devise non supportée ou adresse invalide. Adresse stockée canoniquement en checksum. Applique à `affiliate_payout_settings`, `affiliate_join`, `admin_affiliate_update`.
- **Index MongoDB `affiliates.code`** : reconverti en `partialFilterExpression: {code: {$type: "string"}}` pour permettre plusieurs invités simultanés avec `code: None`.
- **Modèle enrichi `_affiliate_public`** : expose `first_name`, `last_name`, `company`, `coupon_percent`, `payout_configured`, `aliases[]`.
- **Frontend admin InviteModal** : champs Prénom/Nom (obligatoires) + Entreprise (optionnel, prioritaire pour le code) + note interne + langue. Testids: `invite-first-name`, `invite-last-name`, `invite-company`, `invite-email`.
- **Tests E2E validés via curl** : 8 scenarios (invite/reinvite/collision/rename/aliases/toggle/payout invalide/payout valide). Aucune régression sur le demo affilié.


## Update — Février 2026 (session fork, suite 2)
- **Cancel/Reopen — 3 gaps fermés**
  - GAP 1: Cancel manuel admin décrémente désormais le coupon (usage global + par-client) via `_decrement_coupon_usage()`, idempotent grâce au flag `coupon_counted`

## Update — Août 2026 (session fork, suite 3 : import CSV 5 colonnes + payout FX transparence)
- **Import CSV bulk 5 colonnes** — Nouveau parser client-side dans `AdminAffiliates.jsx` détecte les en-têtes `first_name`, `last_name`, `company`, `email`, `discount_percent` (variantes FR/EN, `%` accepté et nettoyé). Rétrocompat avec l'ancien format (email, name) par auto-split. Preview 5 colonnes. Backend `AffiliateBulkInviteRow` étendu (`first_name`, `last_name`, `company`, `discount_percent`, `name` en fallback). Le rabais individuel du CSV est reporté sur `coupon_percent` de la fiche invitée, ce qui produit à l'activation un code `BASE + %` reflétant ce rabais (ex. Bob chez Gym Pro à 15% → `GYMPRO15`). Validation stricte : première/dernier nom obligatoires, sinon ligne rejetée dans `failed[]` avec message clair.
- **FX CAD → USD (Bank of Canada Valet API)** — Nouveau helper `_fetch_cad_to_usd_rate()` : source officielle CAD (gratuite, sans clé), cache mémoire 4h, fallback conservateur `0.72` en cas d'échec réseau. Retourne le tuple `(rate, source)`.
- **Transparence payout affilié** — Le batch `admin_affiliate_run_payouts` capture un `fx_rate_cad_to_usd` unique pour tout le batch et enregistre par payout : `amount_cad` (brut CAD), `amount_usd` (converti), `amount` (target = USDT/USDC ≈ USD 1:1), `currency`, `fx_rate_cad_to_usd`, `fx_source`, `fx_captured_at`. Legacy payouts (sans ces champs) affichent gracefully avec fallback dans l'UI.
- **UI payments dashboard affilié** — Table réorganisée en 6 colonnes : Période, Montant CAD, Taux CAD→USD (avec source Bank of Canada), Reçu (montant en USDT/USDC), Statut, Référence. Note de bas de table explique le mécanisme de conversion + peg USD 1:1. Export CSV enrichi avec `Amount CAD, FX rate, FX source, Paid at`.
- **UI settings dashboard affilié** — Formulaire restreint à USDT/USDC (ERC-20) uniquement. Description contextuelle sur le mécanisme de conversion. **Preview client live** du format d'adresse : erreur inline si format invalide, badge success si checksum EIP-55 détecté, badge warning si lowercase (auto-normalisé serveur). Warning critique sur envoi accidentel sur mauvais réseau (BSC/Polygon/Tron).
- **Migration Mongo index** — `affiliates.code_1` reconstruit en `partialFilterExpression: {code: {$type: "string"}}` (au lieu de sparse-unique legacy). Ancien index droppé automatiquement au démarrage si présent. Permet plusieurs invités concurrents avec code:null sans conflit d'index (bloquant du bulk-invite).
- **Tests E2E** : bulk invite 4 lignes (Alice 12%, Bob Gym Pro 15%, Carol défaut 10%, ligne sans nom rejetée) → 3 sent 1 failed message clair. Activation Bob → code `GYMPRO15` avec coupon_percent=15%. FX Bank of Canada réel : 0.720721 (100 CAD → 72.07 USDT). Login demo affilié intact, écran Settings validé visuellement (preview EIP-55 fonctionne).

  - GAP 2: Cancel manuel reverse la commission affiliée UNIQUEMENT si la commande était payée avant (via `_cancel_order_side_effects(reverse_affiliate=was_paid)`)
  - GAP 3a: Détection paiement tardif Interac — quand un e-Transfer arrive pour un `order_number` déjà annulé, une note système `⚠️ PAIEMENT TARDIF` est ajoutée et les flags `late_payment_flagged`, `late_payment_reference` sont posés (idempotent)

## Sprint A — Août 2026 (quick wins)
- **Backfill first_name/last_name** — Script one-shot `/app/backend/scripts/backfill_affiliate_names.py` (idempotent). Splitte le `name` legacy sur le premier espace : "Marie Dubois" → first="Marie" last="Dubois". Nom vide → fallback email prefix comme first_name. Exécuté : 22 affiliés migrés, 22 no-op au 2nd run.
- **UI Réouverture commande (généralisée)** — Le bouton "Réouvrir" existant dans `AdminOrders.jsx` était trop restrictif (seulement `late_payment_flagged=true` + `auto_unpaid_timeout`). Ajout d'un second bouton "Réouvrir" (bleu nordfjord, testid `reopen-order-btn`) pour **toute commande cancelled** — prompt de motif optionnel + confirmation dialog. Appelle `POST /admin/orders/{id}/reopen` avec `mark_paid: false` (repasse en attente). Le bouton amber "Réouvrir + marquer payé" reste dédié aux cas de paiement tardif détecté (dernière défense côté staff).

## Analyse du patch payout admin fourni (non appliqué — Sprint B)
Patch reçu contenant : scheduler mensuel avec `payout_runs` anti-double, FX BoC avec refus si aucune source, batch NOWPayments 1×2FA, CSV NOWPayments fallback, frontend admin. **Non appliqué en Sprint A** car : (1) le frontend fourni utilise des composants inexistants dans le codebase (`useAPI`, `useModal`, `Table`, `StatusBadge`…), (2) dépendances backend fantômes (`_np_create_payout`, `_np_verify_payout`, `NOWPAYMENTS_PAYOUT_ENABLED`, `PayoutVerifyIn`), (3) FX doublonné avec `_fetch_cad_to_usd_rate()` existant, (4) scheduler UTC minuit = 20h Montréal la veille. À réécrire proprement en session dédiée sur notre stack Tailwind/shadcn avec consolidation FX et scheduler timezone-aware.

  - GAP 3b: Nouvel endpoint `POST /api/admin/orders/{id}/reopen` (payload `{mark_paid, note}`) — 400 si non-cancelled, 409 si stock insuffisant avec rollback atomique. Sinon: ré-décrément stock, restaure coupon.used_count (respecte usage_limit), remet `payment_status` au `prev_payment_status` et pose `reopened_at`. Si `mark_paid=True` → confirme direct via `_mark_order_paid`.
- **Métadonnées d'audit** sur toute commande annulée : `cancelled_at`, `cancelled_reason` (`admin_manual` ou `auto_unpaid_timeout`), `prev_payment_status` conservé.
- **Tests**: 11/11 pass (`/app/backend/tests/test_cancel_reopen_iter25.py`), iteration_25.json.

## Sprint B — Août 2026 (NOWPayments batch + UI aliases + late alert)
- **Alerte email paiement tardif** — Déjà en place via `_send_late_payment_admin_alert()` (déclenché par `_flag_late_cancelled_payment` dans le watchdog Interac). Email HTML admin avec CTA "OPEN ORDER PAGE →". Aucun code ajouté.
- **UI Aliases admin** — Nouvelle section dans le `DetailModal` de `AdminAffiliates.jsx` (testid `affiliate-aliases`). Liste triée par date d'archivage desc, chaque alias affiche code + rabais historique + timestamp archived. Bouton toggle Actif/Inactif (`affiliate-alias-toggle-<code>`) qui appelle `PUT /admin/affiliates/{id}/aliases/{code}` en réel. Confirmations toast + refresh. Section masquée si aucun alias.
- **NOWPayments Batch Payout**
  - Nouveau modèle `AffiliatePayoutBatchIn { payout_ids: List[str], otp: Optional[str] }`.
  - Endpoint `POST /api/admin/affiliates/payouts/batch` — filtre payouts sans adresse/devise valide (renvoyés en `skipped[]`), formate en `usdterc20`/`usdcerc20`, appelle NOWPayments Mass Payouts si `NOWPAYMENTS_PAYOUT_ENABLED=true` + `NOWPAYMENTS_JWT` config (avec header `ncw-verify` OTP), sinon marque `status='queued_manual'` et retourne message clair invitant à l'export CSV. Payouts envoyés : `status='processing'` + `np_batch_id`. Webhook `/api/webhook/nowpayments-payout` existant confirmera → `paid`.
  - Endpoint `GET /api/admin/affiliates/payouts/export.csv` — export CSV format NOWPayments Mass Payouts (Address, Currency, Amount, ExternalId, AffiliateCode, Period) pour les `ready` + `queued_manual`. BOM UTF-8 pour Excel.
  - Scheduler mensuel `_monthly_payouts_scheduler()` — timezone `America/Toronto`, se réveille le 1er du mois à 00:05 locale, génère les payouts du mois précédent via `_generate_payouts_for_period()`. Anti-double via collection `payout_runs` (unique idx sur `(period, auto)`). Exécuté seulement par le worker qui détient `background_tasks` lock (safe en multi-pod).
- **Tests curl** : CSV export → 200, batch endpoint → 400 avec message clair sans payouts éligibles. Scheduler démarre correctement en background sans warning.

