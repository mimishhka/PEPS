# Production security settings

The application code enforces cookie-only browser authentication, rotating refresh sessions, CSRF origin checks, explicit CORS origins, trusted proxy boundaries, and restrictive API response headers. The deployment must preserve these guarantees.

## Required environment

Set these values in the hosting provider's secret store, never in a committed file:

```dotenv
APP_ENV=production
JWT_SECRET=<at-least-32-random-bytes>
ADMIN_PASSWORD=<unique-strong-password>
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=30
COOKIE_SECURE=true
COOKIE_SAMESITE=none
PUBLIC_BASE_URL=https://api.fironova.com
FRONTEND_URL=https://www.fironova.com
CORS_ORIGINS=https://www.fironova.com
CORS_ORIGIN_REGEX=
TRUSTED_PROXIES=<provider-egress-cidr-or-address>
INTERAC_AUTOCONFIRM_MODE=off
INTERAC_TRUSTED_SENDER=<exact-bank-notification-address>
LAUNCH_COUPON_ENABLED=false
ALLOW_DEMO_DATA=false
```

Use `COOKIE_SAMESITE=lax` when the frontend and API are same-site. Keep `CORS_ORIGIN_REGEX` empty unless preview domains are necessary and tightly constrained. `TRUSTED_PROXIES` and its compatibility alias `TRUST_PROXY_IPS` default to no trusted addresses; never set either to `0.0.0.0/0`.

Configure Uvicorn or the process manager to trust forwarded headers only from the same addresses listed in `TRUSTED_PROXIES`. The edge proxy must replace, not append blindly to, client-supplied `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto` headers.

Keep Interac auto-confirmation disabled unless the mailbox integration has been verified end to end. When enabled, `INTERAC_TRUSTED_SENDER` must be the exact notification address and Microsoft Graph messages must report SPF, DKIM, and DMARC as `pass`; a matching display name or From address alone is not accepted.

Launch coupons are opt-in through `LAUNCH_COUPON_ENABLED=true`. Demo seed and cleanup scripts additionally require `ALLOW_DEMO_DATA=true`, refuse production environments, and only operate on database names clearly marked as development, test, demo, or local. Never set either switch in production.

## Frontend and CDN headers

Configure the frontend host/CDN to return at least:

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.fironova.com; manifest-src 'self'; upgrade-insecure-requests
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Adapt `connect-src` only for explicitly used payment or telemetry origins. Test in report-only mode before enforcing changes if the production frontend uses additional external services.

Cache fingerprinted assets for one year with `immutable`. Do not cache HTML, `/api/*`, authentication responses, checkout responses, or customer/order data. Enable Brotli or gzip for text assets and automatic WebP/AVIF image delivery where supported.

## Post-deployment checks

1. Register a new account and confirm no auth cookie is issued before email verification.
2. Login and confirm `access_token` and `refresh_token` are `Secure`, `HttpOnly`, and have the intended `SameSite` values.
3. Expire the access cookie, call `/api/auth/refresh`, and confirm the old refresh token cannot be replayed.
4. Send spoofed forwarded headers directly to the origin and confirm they do not alter scheme, host, or client IP.
5. Verify API responses use `Cache-Control: no-store` and the frontend document receives the CDN CSP.
6. Confirm MongoDB has the TTL index on `refresh_sessions.expires_at` and monitor reuse detections and repeated 401/429 responses.
7. Confirm Interac messages with a spoofed sender or failed SPF, DKIM, or DMARC result cannot change an order's payment state.

NOWPayments webhook verification uses canonical sorted JSON and HMAC-SHA512. Keep `NOWPAYMENTS_IPN_SECRET` in the provider secret store and validate webhook replay protection after rotating it.
