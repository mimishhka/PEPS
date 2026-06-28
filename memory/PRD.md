# NORDPEP — Product Requirements Document

**Last updated**: 2026-06-28

## Original Problem Statement
> E-commerce website for peptides, toggle button for French English, compliance ready for Canada.

## Brand & Positioning
**NORDPEP** — Canadian, lab-grade research peptides supplier. Nordic/Swiss brutalist aesthetic, strictly research-use (Health Canada compliant disclaimers).

## User Personas
1. **Researcher / Lab buyer** — wants lab-tested peptides, COA access, fast Canadian shipping, Interac or crypto payment.
2. **Admin / Store operator** — manages catalog, confirms incoming Interac e-Transfers, marks orders as shipped.

## Core Requirements (Static)
- Bilingual FR/EN toggle (header, persists in localStorage).
- Age verification gate (19+, persists).
- "For Research Use Only — Not for Human Consumption" disclaimer on PDP and confirmation.
- Terms & Conditions acceptance at checkout (3 mandatory checkboxes).
- Canada-only checkout: Province dropdown drives GST/HST/QST tax calc.
- Payment: Interac e-Transfer (manual instructions) + NOWPayments crypto (sandbox-ready).
- Admin dashboard: CRUD products, manage orders, view customers, stats.

## Implementation Status (2026-06-28 · MVP v1)
### Backend (FastAPI + MongoDB)
- ✅ JWT auth: register / login / logout / me (Bearer + httpOnly cookie)
- ✅ Admin seeded on startup (admin@nordpep.ca)
- ✅ 12 pre-populated peptides (BPC-157, TB-500, Semaglutide, Tirzepatide, Ipamorelin, CJC-1295, Selank, Semax, GHK-Cu, Epitalon, Melanotan II, PT-141)
- ✅ Product CRUD admin endpoints
- ✅ Checkout endpoint with province tax matrix (13 provinces/territories), flat $18 CAD shipping
- ✅ Interac flow: returns instructions (email, amount, reference, security Q/A)
- ✅ NOWPayments integration with mock fallback when API key missing
- ✅ Admin: orders list, status updates, customers list, stats (revenue, counts)
- ✅ Compliance flags persisted on each order (age, research-use, terms, IP)

### Frontend (React + Tailwind + shadcn)
- ✅ Swiss/Brutalist design system (Cabinet Grotesk + Satoshi + JetBrains Mono, sharp edges, monochrome + signal red for compliance)
- ✅ FR/EN i18n with comprehensive dictionary
- ✅ Age gate modal with hard-shadow brutalist style
- ✅ Home: typographic hero, marquee trust bar, featured products grid, category tiles
- ✅ Catalog: sidebar filters, sort, grid of products
- ✅ Product detail: lab data table, research-only red banner, COA placeholder
- ✅ Sliding cart drawer with qty controls
- ✅ Checkout: contact + shipping + payment (Interac / crypto tabs) + compliance acks + live tax/total
- ✅ Order confirmation: Interac instructions with copy-to-clipboard or crypto deposit address
- ✅ Auth pages (split layout)
- ✅ Account page with order history
- ✅ Admin console with Tabs (Overview stats, Orders, Products manager, Customers)
- ✅ Compliance page (Terms, Privacy, Shipping, FAQ) bilingual
- ✅ Lab page with COA listing

## Test Results (iteration_1)
- Backend: **100%** (15/15 pytest scenarios pass)
- Frontend: **100%** (E2E flows pass)

## Prioritized Backlog
### P0 (next)
- Configure real NOWPAYMENTS_API_KEY when user provides it (replace mock fallback).
- Add IPN webhook endpoint `/api/webhooks/nowpayments` to auto-mark orders as paid.

### P1
- Email notifications: order confirmation + payment received (Resend or SMTP).
- Real COA PDF uploads + per-batch download from product detail.
- Inventory decrement on paid order.
- Shipping rate by weight/region instead of flat $18.

### P2
- Loyalty / discount codes.
- Wishlist + saved address book.
- Product reviews (researcher verified).
- Multi-currency display (USD/EUR for international researchers — but order still CAD only).
- Brute-force rate limit on /api/auth/login (5 fails → 15 min lockout).
- Tighten anonymous order access (currently anyone with order_id can view).

## Tech Stack
- **Backend**: FastAPI 0.110 · Motor (Mongo) · bcrypt · PyJWT · httpx
- **Frontend**: React 19 · React Router 7 · TailwindCSS · shadcn/ui · lucide-react · sonner
- **DB**: MongoDB (collections: users, products, orders)

## Environment Variables
- `MONGO_URL`, `DB_NAME`
- `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `INTERAC_EMAIL`, `INTERAC_PASSWORD_HINT`
- `NOWPAYMENTS_API_KEY` (empty = mock mode), `NOWPAYMENTS_IPN_SECRET`
- `REACT_APP_BACKEND_URL` (frontend)
