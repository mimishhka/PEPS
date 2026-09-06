# PEPS Ecommerce Rebuild

Clean full-stack rebuild of the PEPS/Fironova ecommerce project. The previous repository was inspected only as concept/reference material; this branch is a fresh foundation with a simpler architecture, clearer domain boundaries, safer auth, payment reconciliation, affiliate tracking, admin review workflows, migrations, tests, and responsive ecommerce UI.

## Current Concepts Preserved

- Bilingual-ready peptide ecommerce storefront with visible 19+ and Research Use Only compliance.
- Product catalog with SKU, lot, purity, COA URL, featured products, stock, and pricing.
- Cart and checkout with free shipping threshold, terms acceptance, and customer email/account continuity.
- Customer account/order history workflow.
- Admin dashboard for products, orders, customers, affiliates, payouts, refunds, failures, and reconciliation.
- Affiliate/referral links using `?ref=CODE`, first-click attribution, click metadata, commissions, payout threshold, payout status, and admin review.
- Payment provider ideas from the old app: Interac/manual confirmation, card provider, NOWPayments/crypto, provider webhooks, idempotency, failure/refund handling, and manual reconciliation queue.

## New Architecture

```text
backend/app.py              FastAPI app factory and routes
backend/domain.py           Pure domain services for checkout, payment events, affiliates, payouts
backend/migrations/001_initial.sql
backend/tests/test_critical_flows.py
frontend/src/App.tsx        Responsive storefront/admin prototype wired around real workflows
frontend/src/styles.css     PEPS/Fironova visual system: paper, garnet, copper, signal red
```

The backend is intentionally split between API and domain logic. The domain layer is testable without HTTP, and external providers are behind a `PaymentProvider` interface so Stripe, Interac, NOWPayments, and future processors can be swapped without rewriting checkout.

## Security Posture

- Browser sessions use `HttpOnly` cookies; JWTs are not returned for browser storage.
- Admin/staff authorization is role-based. There is no hidden admin link or auto-login.
- CORS uses explicit origins only.
- Request bodies are validated with Pydantic schemas.
- Payment webhooks use idempotency records and should be paired with provider signature verification secrets in production.
- Secrets live in environment variables, never in committed files.

## Local Setup

```bash
cp .env.example .env
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app:app --reload

cd ../frontend
npm install
npm run dev
```

## Tests

```bash
cd backend
pytest
```

The included tests cover checkout totals, stock reservation, affiliate commission creation, webhook idempotency, refund/failure handling, click attribution, and payout review state changes.

## Production Notes

- Run the SQL migration in `backend/migrations/001_initial.sql` before booting production.
- Configure `JWT_SECRET`, `ADMIN_PASSWORD`, payment keys, webhook secrets, sender email, and fulfillment provider secrets in the deployment secret store.
- Keep `CORS_ORIGINS` explicit; never use `*` with credentials.
- Add provider-specific webhook signature checks before enabling live payments.
