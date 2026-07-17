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

