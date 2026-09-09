# ELOFIX PHASE B — HOSTED STAGING VALIDATION REPORT

## 1. Deployment

Frontend URL:
`https://elofix.co.za` (also `https://www.elofix.co.za`, `https://elofix.netlify.app`)

Backend URL:
`https://elofix-6136.onrender.com`

Branch:
`phase-b-hosted-staging-validation`

Commit SHA:
`e06c3d1681e5e7fd17e32f3c3470c192a4d07858`

PR:
https://github.com/blanogqala/ELOFix/compare/main...phase-b-hosted-staging-validation?expand=1

The live Render service is still a **pre-Phase-A** build (`GET /ready` returns 404). The live Netlify bundle still contains `http://localhost:5000`. This branch must be deployed and Netlify `VITE_*` HTTPS variables must be set, then rebuilt.

---

## 2. Environment Validation

Names only. Values not printed.

Render:
`NODE_ENV`, `NODE_VERSION`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `SECRET_KEY`, `BANK_KDF_SALT`, `ENCRYPTION_VERSION`, `FRONTEND_URL`, `FRONTEND_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `PAYMENT_BASE_URL`, `PAYMENT_CURRENCY`, `ENABLED_PAYMENT_PROVIDERS`, `PAYFAST_MODE`, `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `UPLOAD_ROOT`, `ELOFIX_ALLOW_LOCAL_UPLOADS`, `RESEND_API_KEY`, `EMAIL_FROM`, `CONTACT_FORM_TO_EMAIL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, optional `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `OPENROUTESERVICE_API_KEY`, `OPENCAGE_API_KEY`, `TRUST_PROXY`

Netlify:
`NODE_VERSION`, `VITE_API_BASE_URL`, `VITE_API_ORIGIN`, `VITE_SOCKET_URL`, `VITE_FRONTEND_URL`

database:
`DATABASE_URL`

storage:
`UPLOAD_ROOT`, `ELOFIX_ALLOW_LOCAL_UPLOADS` (S3 names exist in code but are unused for this staging choice)

sandbox payment:
`ENABLED_PAYMENT_PROVIDERS`, `PAYFAST_MODE`, `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYMENT_BASE_URL`, `PAYMENT_CURRENCY`

Must **not** be set on staging Render: `PAYFAST_SETTLE_ON_RETURN`, `PAYFAST_SKIP_IP_CHECK`, `ELOFIX_TESTING_MODE`, `ELOFIX_AUTH_RATE_LIMIT_DISABLED`

---

## 3. Health & Readiness

`/health`:
HTTP status: 200 on current live API (`{"ok":true}`)

`/ready`:
HTTP status: 404 on current live API (Phase A probe not deployed yet)

Checks:
Not available until this branch is deployed. After deploy, expect `status=ready` with `app`, `database`, `config`, `storage`. Staging disk path requires `ELOFIX_ALLOW_LOCAL_UPLOADS=true` or `/ready` returns 503 `storage=invalid`.

---

## 4. Database

Migration count:
Not recorded on live (deploy uses `npx prisma migrate deploy` in Render build). Live `GET /api/categories` returns five active categories including Plumbing with `paymentMode: TWO_PAYMENT_50_50`.

Migration status:
Unknown until Render build logs for this branch are inspected. Do not use `prisma db push`.

Restart persistence:
PASS for existing category rows (created 2026-08-21, still present). FAIL pending for post-redeploy file+job persistence until Phase B is actually running on Render.

---

## 5. Object Storage

Provider KYC upload: FAIL (blocked on redeploy + disk opt-out)
Job photo: FAIL (blocked on redeploy)
Completion evidence: FAIL (blocked on redeploy)
Supplier image: FAIL (blocked on redeploy)
Restart persistence: FAIL (blocked on redeploy)
Private ACL: PARTIAL — unknown file id returns 404; anonymous `/api/auth/me` and `/api/admin/analytics` return 401. Live private KYC 403/200 matrix not executed against real objects.

---

## 6. Customer Journey

registration: FAIL (hosted app calls localhost)
login: FAIL (hosted app calls localhost)
request: FAIL
provider: FAIL
quotation: FAIL
materials: FAIL
payment deposit: FAIL
job progression: FAIL
completion payment: FAIL
completion: FAIL
review: FAIL

Cause: production JS bundle still inlines `http://localhost:5000`. Local production build of this branch with HTTPS `VITE_*` does **not** use localhost:5000 as the API origin.

---

## 7. Provider Journey

onboarding: FAIL
KYC: FAIL
approval: FAIL
matching: FAIL
inspection: FAIL
quotation: FAIL
materials: FAIL
job: FAIL
completion: FAIL
earnings: FAIL

Same hosted localhost bundle blocker.

---

## 8. Supplier Journey

inventory: FAIL
products: FAIL
orders: FAIL
fulfillment: FAIL
delivery/pickup: FAIL
notifications: FAIL
accounting: FAIL

---

## 9. Admin Journey

provider approval: FAIL
users: FAIL
suppliers: FAIL
jobs: FAIL
orders: FAIL
payments: FAIL
disputes: FAIL
refunds: FAIL
restrictions: FAIL
audit: FAIL (UI). Anonymous `GET /api/admin/analytics` on live API: 401 PASS.

---

## 10. Authorization Tests

Anonymous:
`GET /api/auth/me` → 401
`GET /api/admin/analytics` → 401
`POST /api/payments/intents/:id/confirm-return` → 401
`GET /api/files/{unknown}` → 404

Customer:
not executed (no staging seed run against hosted DB from this session; UI login blocked by localhost bundle)

Provider:
not executed

Supplier:
not executed

Admin:
not executed (UI). API deny-by-default for missing token: 401.

Invalid token `Authorization: Bearer not-a-jwt` on `/api/auth/me` → 401

CORS (live, pre-fix):
`Origin: https://elofix.co.za` → 200 + `Access-Control-Allow-Origin`
`Origin: https://www.elofix.co.za` → 500 (P1)
`Origin: https://elofix.netlify.app` OPTIONS → 500 (P1)
`Origin: https://evil.example` → 500 (P1)

Code on this branch rejects unknown origins with `callback(null, false)` so they no longer 500. Operators must still add `www` and Netlify hosts to `CORS_ALLOWED_ORIGINS`.

---

## 11. Payment Tests

Deposit: FAIL (not run hosted)
Completion: FAIL
Materials: FAIL
Delivery: FAIL
Amount tampering: not run hosted (covered by local `paymentAmountSecurity.test.js` PASS)
Duplicate webhook: not run hosted (covered by local webhook tests PASS)
Return without webhook: live confirm-return requires auth (401). Full “return URL does not mark paid” needs Phase A deploy plus ITN. Do not set `PAYFAST_SETTLE_ON_RETURN` on Render.
Refund/cancellation where tested: not run hosted

Paystack: NOT IMPLEMENTED

---

## 12. Realtime Tests

Customer ↔ Provider: FAIL (not run hosted)
Supplier order: FAIL
Notifications: FAIL
Reconnect: FAIL
Cross-user isolation: FAIL

---

## 13. Failure Tests

API unavailable: not run hosted UI
Expired JWT: FAIL (not run)
Invalid upload: FAIL (not run)
Oversized upload: FAIL (not run)
S3 failure: N/A (disk opt-out). Disk failure not injected.
Duplicate action: FAIL (not run)
Socket disconnect: FAIL (not run)

Anonymous invalid file: 404 PASS

---

## 14. Responsive Hosted Tests

390×844: FAIL (Playwright browsers missing in this agent environment; live landing HTML loads EloFix title)
430×932: FAIL (not run)
768: FAIL (not run)
1440: FAIL (not run)

Functional defect (not cosmetic): hosted SPA currently cannot talk to the API from any viewport because the bundle targets localhost.

---

## 15. Automated Tests

Backend:
files passed: 77
failed: 0

Frontend lint:
errors: 0
warnings: existing React Router future-flag stderr in tests only (not ESLint failures)

Vitest:
files: 51
tests: 288
failed: 0

Build:
PASS (local production build with HTTPS `VITE_API_ORIGIN` / `VITE_API_BASE_URL`)

Playwright local:
passed: hosted-smoke skipped 10/10 when `ELOFIX_HOSTED_SMOKE` unset
skipped: 10 (hosted-smoke)
failed: 0 for that subset. Full `npm run e2e` not re-run in this session (CI job remains the gate).

Playwright hosted:
passed: 1 (`anonymous admin API is denied`)
skipped: 1 (private file id unset)
failed: 8 (Chromium not installed in agent sandbox). After `npx playwright install`, re-run against HTTPS `PLAYWRIGHT_BASE_URL`.

GitHub Actions:
Backend: pending on PR against `main`
Frontend: pending on PR against `main`
Playwright: pending on PR against `main`

---

## 16. Bugs Found

Severity: P0
Problem: Hosted frontend production bundle calls `http://localhost:5000` for API/socket/uploads.
Root cause: Netlify build environment missing HTTPS `VITE_API_BASE_URL` / `VITE_API_ORIGIN` / `VITE_SOCKET_URL` (or an old build from before fail-closed config).
Fix: Set those Netlify variables to the Render HTTPS origin and rebuild this branch. Production `npm run build` already rejects localhost.
Regression test: `frontend/scripts/productionFrontendConfig.test.mjs`; hosted-smoke landing test.

Severity: P0
Problem: Live API has no `/ready` (404). Phase A readiness is not deployed.
Root cause: Render is serving a pre-Phase-A revision.
Fix: Deploy `phase-b-hosted-staging-validation`, set `ELOFIX_ALLOW_LOCAL_UPLOADS=true` with persistent `UPLOAD_ROOT`, confirm `/ready` 200. Do not disable the probe.
Regression test: `elofix-backend/tests/ready.endpoint.test.js`, `objectStorage.readiness.test.js`.

Severity: P1
Problem: Unknown or extra frontend origins (`www`, Netlify, random) return HTTP 500 on CORS.
Root cause: `createCorsOriginChecker` passed `callback(new Error(...))`.
Fix: `callback(null, false)` in `corsOrigins.util.js`. Still no `*`. Add `www` + Netlify to `CORS_ALLOWED_ORIGINS`.
Regression test: `tests/cors.origin.http.test.js`.

Severity: P2
Problem: Staging seed accounts and hosted Playwright smoke were missing.
Root cause: CI only seeded admin + one e2e pair.
Fix: `scripts/seed-staging.js` + `e2e/hosted-smoke.spec.ts` + remote `PLAYWRIGHT_BASE_URL` skips `webServer`.
Regression test: `tests/stagingSeed.config.test.js`; hosted-smoke skips unless `ELOFIX_HOSTED_SMOKE=1`.

---

## 17. Known Remaining Issues

P0:
- Live Netlify/apex bundle still uses localhost API.
- Live Render not yet on this branch (`/ready` missing).
- Hosted customer/provider/supplier/admin journeys not executed against a correct build.

P1:
- CORS 500 on live until this branch is deployed.
- `www.elofix.co.za` not on live CORS allowlist (apex is).
- PayFast hosted ITN + two-tranche sandbox not validated on public webhook.
- Staging seed not applied on hosted DB from this session.

P2:
- MapLibre major-version security upgrade remains Phase C unless hosted maps break after the correct deploy.
- Hosted Playwright Chromium must be installed in the operator environment (`npx playwright install`).
- Resend local tests hit rate/daily quota; staging email delivery not proven this session.

P3:
- README still contains legacy Firebase starter text (out of Phase B scope).

---

## 18. Business Logic Confirmation

TWO_PAYMENT_50_50:
UNCHANGED

Deposit 50%:
UNCHANGED

Completion 50%:
UNCHANGED

EloFix 7%:
UNCHANGED

Provider 93%:
UNCHANGED

Supplier 7%:
UNCHANGED

PaymentIntent:
PRESERVED

Paystack:
NOT IMPLEMENTED

---

## 19. Phase B Final Verdict

PHASE B READY FOR INDEPENDENT REVIEW: NO
