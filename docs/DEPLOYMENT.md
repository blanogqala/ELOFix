# EloFix deployment

This document describes how to run EloFix in **development**, **staging**, and **production**. It lists environment variable **names** only. Never put real secrets, JWT keys, PSP keys, or database passwords in Git.

Full stack: React/Vite frontend (Netlify) + Express/Prisma API (Render) + PostgreSQL + S3-compatible object storage.

See also: [elofix-backend/docs/PAYMENTS_DEPLOYMENT.md](../elofix-backend/docs/PAYMENTS_DEPLOYMENT.md), [elofix-backend/docs/IMAGE_STORAGE_DEPLOY.md](../elofix-backend/docs/IMAGE_STORAGE_DEPLOY.md), [docs/maps/Deployment.md](maps/Deployment.md).

---

## Development

Typical setup:

- Runtime: **Node.js 22.x LTS** (backend, frontend, CI, Render `NODE_VERSION`, Netlify `NODE_VERSION`)
- Frontend: `http://localhost:8080` (or Vite default)
- Backend: `http://localhost:5000`
- Database: local PostgreSQL
- Payments: PayFast **sandbox**
- `PAYFAST_SKIP_IP_CHECK` and `PAYFAST_SETTLE_ON_RETURN` may be `true` (localhost cannot receive ITN)

### Frontend (`frontend/.env`, from `.env.example`)

- `VITE_API_BASE_URL`
- `VITE_API_ORIGIN`
- `VITE_SOCKET_URL` (optional)
- `VITE_FRONTEND_URL`
- `VITE_API_URL` (optional)
- `VITE_PAYMENTS_RETURN_BASE` / `VITE_PAYMENTS_CANCEL_BASE` (optional)
- `VITE_USE_FIREBASE` and `VITE_FIREBASE_*` (optional)
- `VITE_MAPTILER_API_KEY` / `VITE_TILE_PROVIDER` / `VITE_MAP_STYLE` (optional)

### Backend (`elofix-backend/.env`, from `.env.example`)

- `DATABASE_URL` (optional `LOCAL_DATABASE_URL` in development)
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `SECRET_KEY`, `BANK_KDF_SALT`, `ENCRYPTION_VERSION`
- `PORT`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_URL`
- `RESEND_API_KEY`, `EMAIL_FROM`, `CONTACT_FORM_TO_EMAIL`
- `PAYMENT_CURRENCY`, `PAYMENT_BASE_URL`, `FRONTEND_BASE_URL`, `ENABLED_PAYMENT_PROVIDERS`
- `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_MODE`
- Optional local-only: `PAYFAST_SETTLE_ON_RETURN`, `PAYFAST_SKIP_IP_CHECK`
- Optional local/CI-only: `ELOFIX_AUTH_RATE_LIMIT_DISABLED` (ignored when `NODE_ENV=production`)
- Optional: `S3_*`, `UPLOAD_ROOT`, `FILE_ACCESS_*`, Payflex / PayJustNow, geocode/routing keys

### Run

```bash
cd elofix-backend
npx prisma generate
npx prisma migrate deploy
npm run dev

cd frontend
npm run dev
```

Probes: `GET http://localhost:5000/health` (process up), `GET http://localhost:5000/ready` (database + config).

---

## Staging (Netlify + Render, KYC / demo review)

Typical setup:

- Frontend: Netlify site
- API: Render web service (`elofix-backend`)
- Database: Render (or other) PostgreSQL — **not** production data
- Files: S3-compatible bucket (Cloudflare R2 / AWS S3), **or** a persistent Render Disk with `ELOFIX_ALLOW_LOCAL_UPLOADS=true`. Do not rely on the ephemeral Render filesystem.
- Payments: PayFast **sandbox**. ITN webhooks must reach the public API URL.
- `NODE_ENV=production` on Render. **Forbidden:** `PAYFAST_SKIP_IP_CHECK=true` and `PAYFAST_SETTLE_ON_RETURN=true` (API startup fails closed).

### Render secrets (`sync: false` — set in the dashboard)

- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `FRONTEND_BASE_URL`, `CORS_ALLOWED_ORIGINS` (exact HTTPS origins — no `*`). Include every public frontend host (apex, `www`, and the Netlify site) as a comma-separated list.
- `PAYMENT_BASE_URL`
- `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`
- `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (omit when using persistent disk)
- `UPLOAD_ROOT` (required for persistent disk; mount path e.g. `/opt/render/project/src/uploads`)
- `ELOFIX_ALLOW_LOCAL_UPLOADS` (`true` only when using a persistent Render Disk, not ephemeral disk)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` (required if you run `prisma seed` against this environment)
- `SECRET_KEY`, `BANK_KDF_SALT`
- `RESEND_API_KEY` / `EMAIL_FROM` if password-reset email is required
- Staging accounts: `STAGING_SEED_PASSWORD` (and optional `STAGING_*_EMAIL` / `STAGING_*_PASSWORD`) when running `npm run prisma:seed-staging`

`DATABASE_URL` comes from the Render database. `PAYFAST_MODE=sandbox` is set in [`render.yaml`](../render.yaml).

### Netlify build environment

Must set (otherwise the production build **fails closed** — localhost is rejected):

- `VITE_API_BASE_URL` — public API including `/api`
- `VITE_API_ORIGIN` — same host without `/api`
- `VITE_SOCKET_URL` — public API origin
- `VITE_FRONTEND_URL` — this Netlify URL

Optional: Firebase / MapTiler keys (public browser keys only; restrict by HTTP referrer).

---

## Production (after Paystack/PSP approval)

Typical setup:

- Real public frontend domain
- Real API URL
- Production PostgreSQL
- Persistent object storage
- Live PSP (`PAYFAST_MODE=live` after approval — **do not implement Paystack in Phase A**)
- Strict webhook signature + IP verification
- No browser-return settlement
- No skip-IP
- Admin seed must use strong `ADMIN_*` values; missing values fail closed

Same variable **names** as staging. Additional production-only expectations:

- `PAYFAST_MODE=live`
- `ALLOW_ADMIN_PAYMENT_OVERRIDE` unset or `false`
- `ELOFIX_TESTING_MODE` must **not** be `true`
- Strong unique `JWT_SECRET`, `SECRET_KEY`, `BANK_KDF_SALT`, `FILE_ACCESS_SECRET`
- Webhook URLs registered at the PSP:
  - `{PAYMENT_BASE_URL}/api/payments/webhooks/payfast`

Liveness: `GET /health` (Render `healthCheckPath` may stay `/health`). Readiness: `GET /ready` (Postgres `SELECT 1` + production payment safety) — use this for staging probes.

Auth/contact IP rate limits (login 5 / 15 min, register 10 / 15 min) are always enforced in production. Local and CI e2e may bypass them on loopback or when `ELOFIX_E2E_FULL_STACK=1`. `ELOFIX_AUTH_RATE_LIMIT_DISABLED` is ignored when `NODE_ENV=production`.

Client IP for rate limits is Express `req.ip`. Production sets `trust proxy` to **1** (Render’s reverse proxy) unless `TRUST_PROXY` overrides it. The API does **not** read raw `X-Forwarded-For` for rate limiting; spoofed headers are ignored unless they pass through the configured trusted proxy hop.

Production `/ready` requires object storage (`S3_BUCKET` + access keys) unless `ELOFIX_ALLOW_LOCAL_UPLOADS=true` (persistent disk only). Critical private uploads fail closed if the remote put fails.

---

## Playwright E2E (legitimate skips)

`npm run e2e` runs every spec under `frontend/e2e`. These tests **skip unless extra env is set** (they are not hidden from CI; Playwright reports them as skipped):

| Spec | Skip unless |
| --- | --- |
| `customer.provider.lifecycle.spec.ts` | `ELOFIX_E2E_FULL_STACK=1` (CI e2e job sets this) |
| `realtime-cross-user.spec.ts` (4 tests) | `E2E_PROVIDER_EMAIL`, `E2E_PROVIDER_PASSWORD`, `E2E_CUSTOMER_EMAIL`, `E2E_CUSTOMER_PASSWORD`, and `E2E_REALTIME_JOB_ID` |
| `hosted-smoke.spec.ts` | `ELOFIX_HOSTED_SMOKE=1` plus staging account env vars. Set `PLAYWRIGHT_BASE_URL` to the Netlify HTTPS origin (do not hardcode). Remote HTTPS base URLs skip Playwright `webServer`. |

CI e2e does **not** skip the customer↔provider lifecycle. The realtime suite stays skipped in default CI because it needs two pre-seeded live accounts and a specific job id.

## Production frontend fail-closed

`npm run build` (Vite production mode) **rejects** missing `VITE_API_ORIGIN` / `VITE_API_BASE_URL` and rejects localhost / `127.0.0.1` API origins. Development (`npm run dev`, `npm run build:dev`) may use localhost.

---

## Manual actions Git cannot do

1. Create the S3/R2 bucket and enter keys in Render, **or** keep the existing persistent Render Disk and set `ELOFIX_ALLOW_LOCAL_UPLOADS=true` plus `UPLOAD_ROOT`.
2. Enter remaining secrets in the Render Environment tab.
3. Enter `VITE_*` values in Netlify site environment (then trigger a rebuild).
4. Point custom domains at Netlify and Render.
5. Register PayFast ITN / return URLs in the merchant dashboard.
6. Restrict public map/Firebase keys by domain.
7. Deploy branch `phase-b-hosted-staging-validation` on Render and Netlify (do not leave production/staging on a pre-Phase-A build).
8. Run `npm run prisma:seed` then `npm run prisma:seed-staging` against staging `DATABASE_URL` (passwords via env only).

### Phase B staging cutover (existing Netlify + Render)

Before the hosted site can pass Phase B:

- Render: `NODE_VERSION=22`, `NODE_ENV=production`. **Remove** `PAYFAST_SETTLE_ON_RETURN` and `PAYFAST_SKIP_IP_CHECK` or the API will not boot.
- Render: `FRONTEND_URL`, `FRONTEND_BASE_URL`, `CORS_ALLOWED_ORIGINS` must list every public frontend host (apex, `www`, Netlify). No `*`.
- Render: `PAYMENT_BASE_URL` = public API HTTPS origin. PayFast sandbox ITN = `{PAYMENT_BASE_URL}/api/payments/webhooks/payfast`.
- Render: persistent disk `UPLOAD_ROOT` + `ELOFIX_ALLOW_LOCAL_UPLOADS=true` (Phase B does not introduce S3).
- Netlify: `VITE_API_BASE_URL`, `VITE_API_ORIGIN`, `VITE_SOCKET_URL`, `VITE_FRONTEND_URL` as HTTPS (never localhost). Rebuild after setting.
- Confirm `GET /health` is 200 and `GET /ready` is 200 with `checks.storage=ok`. Do not disable readiness.
