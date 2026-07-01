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
- Page FAQ dédiée /faq créée (accordéons Shadcn, 5 catégories, 22 questions bilingues FR/EN) alignée sur les Conditions Générales, la Politique d'expédition (200 $ gratuit, 14 h HE, délais régionaux, colis perdus, erreurs d'adresse) et les paiements (Stripe, Interac, NOWPayments). Sections : Expédition, Entreposage & manipulation, Paiement, Commandes/retours/remboursements, Produits & usage permis (19+, recherche uniquement, liens vers CG). Bloc contact info@nordpep.ca. Lien pied de page mis à jour ; ancienne section FAQ retirée de /compliance.
- Livraison : tarif fixe 20 $ sous 200 $, GRATUITE dès 200 $ (backend _build_order_totals + checkout frontend avec indice « plus que X $ »). Env: FREE_SHIPPING_THRESHOLD_CAD=200.
- Annulation automatique des commandes impayées après 48 h (watchdog asyncio horaire + au démarrage) : statuts cancelled, note système, remise en stock des variantes. Env: UNPAID_ORDER_TTL_HOURS=48.
- Textes mis à jour : politique d'expédition (tarif fixe + section Commandes impayées) et FAQ (2 réponses). Testé par testing_agent (iteration_5.json — 100 % backend & frontend).
- Bandeau d'avertissement rouge « Paiement requis sous 48 heures » sur la page de confirmation (Interac/crypto, masqué si payé/annulé). Validé par testing_agent (iteration_6.json, 8/8). Mention « stock réservé libéré » retirée du bandeau à la demande de l'utilisateur.
