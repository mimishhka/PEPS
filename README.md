# Here are your Instructions

## Backend layout

`backend/server.py` holds the FastAPI app, configuration, Pydantic models, and the
route handlers. Integration and domain logic lives under `backend/services/`:

| Module | Owns |
| --- | --- |
| `services/mail.py` | Resend transport, email outbox worker, janitor, template catalogue and rendering |
| `services/canada_post.py` | Rating, shipment/label and manifest generation, artifact download, voiding, delivery tracking sync |
| `services/interac.py` | Microsoft Graph mailbox polling and Interac e-Transfer auto-confirmation |
| `services/nowpayments.py` | Crypto invoices, IPN verification and handling, mass payouts |
| `services/affiliate.py` | Tiers, referral attribution, coupon codes and aliases, metrics, invitations, payouts |
| `services/stock.py` | Atomic reservation/release, restock, back-in-stock and low-stock alerts |

Routes stay in `server.py` and `backend/routers/`; a service never declares one.
Services read configuration, the Mongo handle, and anything still in `server.py`
through `import server as s`. `server.py` registers itself in `sys.modules` under
both `server` and `backend.server`, so either entrypoint works, and it re-exports
the service symbols that existing call sites resolve by bare name.

Outbound side effects — provider HTTP calls, email sends, stock mutations — are
always invoked as `s.<name>`, even from inside the owning service, so `server` stays
the single namespace where a caller can substitute them.

## Environment configuration

Copy `.env.example` to `.env` and populate your Canada Post credentials before running the backend.

Required Canada Post settings:

- `CANADA_POST_API_KEY`
- `CANADA_POST_CUSTOMER_NUMBER`
- `CANADA_POST_ORIGIN_POSTAL_CODE`
- `CANADA_POST_ENVIRONMENT=prod`

Optional sender info:

- `CANADA_POST_SENDER_NAME`
- `CANADA_POST_SENDER_ADDRESS`
- `CANADA_POST_SENDER_CITY`
- `CANADA_POST_SENDER_PROVINCE`
- `CANADA_POST_SENDER_PHONE`

Do not commit `.env` to source control.

Production cookie, proxy, CSP, CDN, and verification requirements are documented in
[`backend/docs/PRODUCTION_SECURITY.md`](backend/docs/PRODUCTION_SECURITY.md).

## Google OAuth setup

To enable Google Sign-In for customers, add these variables to your `.env` (see `.env.example`):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (must point to the backend callback, e.g. `https://api.fironova.com/api/auth/google/callback`)

When enabled, users can sign in via Google; the backend will create or attach the account and set the same httpOnly session cookie used by email/password login.

