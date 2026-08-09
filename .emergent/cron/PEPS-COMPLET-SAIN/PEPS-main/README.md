# Here are your Instructions

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

## Authentication

Customers sign in with email + password or with a passwordless magic link (both
set the same httpOnly session cookie). No third-party OAuth provider is wired
into the backend.

## Interac Autodeposit auto-confirmation (Microsoft Graph)

The backend polls the Interac e-transfer mailbox (`orders@fironova.com`) and auto-marks
orders as paid when the Autodeposit deposit notification matches an order reference (`FN-…`)
**and** the amount. A notification without a matching reference or with a divergent amount is
never auto-confirmed — it is logged for manual review (same defense as the NOWPayments IPN).

Add these variables to `backend/.env`:

- `INTERAC_EMAIL` — the Interac Autodeposit mailbox (e.g. `orders@fironova.com`)
- `INTERAC_GRAPH_TENANT_ID` — Azure app registration → Directory (tenant) ID
- `INTERAC_GRAPH_CLIENT_ID` — Azure app registration → Application (client) ID
- `INTERAC_GRAPH_CLIENT_SECRET` — client secret **Value** (visible only at creation)
- `INTERAC_GRAPH_USER` — optional; defaults to `INTERAC_EMAIL`. Use this if the mailbox is an
  alias/subuser whose address differs from `INTERAC_EMAIL`.
- `INTERAC_GRAPH_POLL_SECONDS` — optional; polling interval (default `120`)

The Azure app needs the **`Mail.ReadWrite`** application permission with **admin consent**
granted. The watchdog runs only when the Graph credentials are set.

Dry-run (read-only) validation, run from `backend/`:

```bash
python3 dryrun_interac.py
```

It verifies the Graph token, mailbox access, and prints what the watchdog *would* have done
for each unread Interac notification — without marking anything read or touching any order.

