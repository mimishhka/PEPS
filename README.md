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

## Google Sign-In — not implemented

This section previously documented Google OAuth setup as a working feature.
It is not implemented: the backend contains no `GOOGLE_CLIENT_ID` handling and
no `/api/auth/google/callback` route. Sign-in is email/password plus magic link.

If Google Sign-In is wanted, it needs building; until then there is nothing to
configure, and the variables that used to be listed here had no effect.

