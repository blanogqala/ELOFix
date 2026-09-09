# ELOFIX PHASE B — HOSTED STAGING VALIDATION REPORT

## 1. Deployment

Frontend URL:
`https://elofix.co.za` (also `https://www.elofix.co.za`, `https://elofix.netlify.app`)

Backend URL:
`https://elofix-6136.onrender.com`

Branch:
`phase-b-hosted-staging-validation`

Commit SHA:
`d4753590` (plus uncommitted hosted-smoke + hosted API validator in this pass; SHA of the follow-up commit is recorded after push)

PR:
https://github.com/blanogqala/ELOFix/compare/main...phase-b-hosted-staging-validation?expand=1

Hosted Render and Netlify are on this branch. Production JS `index-sbf8g7p6.js` inlines `elofix-6136.onrender.com` (5 occurrences). `localhost:5000` still appears as a Vite fallback string (3 occurrences); Playwright recorded **zero** localhost network requests from the live landing page.

---

## 2. Environment Validation

Names only. Values not printed.

Render (inferred from `/ready` `config=ok` + `storage=ok`, CORS headers, and operator confirmation):
`NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` / `FRONTEND_BASE_URL`, `CORS_ALLOWED_ORIGINS`, PayFast sandbox names, `UPLOAD_ROOT`, `ELOFIX_ALLOW_LOCAL_UPLOADS`

Netlify:
`VITE_API_BASE_URL`, `VITE_API_ORIGIN`, `VITE_SOCKET_URL`, `VITE_FRONTEND_URL` (HTTPS Render)

database:
hosted PostgreSQL (staging accounts present in admin lists)

storage:
existing Render Disk via `ELOFIX_ALLOW_LOCAL_UPLOADS` + `UPLOAD_ROOT`

sandbox payment:
PayFast (`ENABLED_PAYMENT_PROVIDERS` includes payfast). `/ready` `config=ok` means `PAYFAST_SETTLE_ON_RETURN` and `PAYFAST_SKIP_IP_CHECK` are **not** set.

Must **not** be set on staging Render: `PAYFAST_SETTLE_ON_RETURN`, `PAYFAST_SKIP_IP_CHECK`, `ELOFIX_TESTING_MODE`, `ELOFIX_AUTH_RATE_LIMIT_DISABLED`

This operator session has `ADMIN_*` in local dotenv and does **not** have `STAGING_SEED_PASSWORD` (process / User / Machine / `elofix-backend/.env`). Role journeys that need Customer A/B, Provider A/B, or Supplier login were not executed from here.

---

## 3. Health & Readiness

`/health`:
HTTP status: 200
`{"ok":true}`

`/ready`:
HTTP status: 200
`{"status":"ready","checks":{"app":"ok","database":"ok","config":"ok","storage":"ok"}}`

---

## 4. Database

Migration count:
Not read from Render logs this pass. Live `GET /api/categories` returns 5 categories, all `TWO_PAYMENT_50_50`.

Migration status:
Hosted API is serving Phase A/B schema (admin customers/providers/suppliers/jobs/material-orders all 200).

Restart persistence:
PASS for existing seeded users (Customer A/B, Provider A/B, Supplier found via admin APIs). FAIL pending for **post-redeploy file persistence** — this session did not restart the Render service (no Render API credential in operator env).

Seeded accounts confirmed present (emails only):
Customer A/B, Provider A (`approved=true`), Provider B (`approved=false`), Supplier.

---

## 5. Object Storage

Provider KYC upload: FAIL (not run — staging provider password not in operator env)
Job photo: FAIL (not run — same)
Completion evidence: FAIL (not run)
Supplier image: FAIL (not run)
Restart persistence: FAIL (Render restart not performed this pass)
Private ACL: PARTIAL — anonymous `/api/auth/me` 401; anonymous `/api/admin/analytics` 401; invalid JWT 401. Real KYC / quotation / job-photo / completion object matrix not executed (no hosted upload IDs created this pass). Public marketplace listing does not include Provider B.

---

## 6. Customer Journey

registration: N/A (seeded accounts; do not register extra users against production auth rate limit)
login: FAIL (not run — `STAGING_SEED_PASSWORD` absent in this operator env)
profile: FAIL (not run)
categories: PASS (public `GET /api/categories` 200, count=5)
location: FAIL (not run)
service request: FAIL (not run)
job photo: FAIL (not run)
provider discovery: PARTIAL — public `GET /api/providers` 200, n=2, Provider B excluded
provider selection: FAIL (not run)
job creation: FAIL (not run)
notifications: FAIL (not run)
quotation: FAIL (not run)
materials: FAIL (not run)
delivery: FAIL (not run)
sandbox DEPOSIT: FAIL (not run)
job progression: FAIL (not run)
sandbox COMPLETION: FAIL (not run)
completion confirmation: FAIL (not run)
review/rating: FAIL (not run)
refresh / logout-login / duplicate submit / Customer B isolation / cancel-dispute: FAIL (not run)

These are **not** the previously fixed localhost-bundle / missing-`/ready` failures. The hosted SPA talks to Render. Remaining gap is operator credentials for seeded role accounts.

---

## 7. Provider Journey

Provider A login/dashboard/profile/skills/location/KYC/work post/match/inspection/quotation/materials/progression/completion evidence/notifications/earnings/banking: FAIL (not run — staging password absent)

Provider B unapproved restrictions:
PASS at marketplace list (`staging.provider.b@elofix.test` not in public providers).
FAIL pending for authenticated match/quote privileges (Provider B login not run).
Admin: Provider B exists and `approved=false`. Provider A exists and `approved=true`.

---

## 8. Supplier Journey

login / branch / inventory / product / product image / stock-price / material order / fulfillment / pickup-delivery / notifications / accounting / isolation: FAIL (not run — staging password absent)

Admin: supplier record present (`GET /api/admin/suppliers` 200, includes seeded supplier).

---

## 9. Admin Journey

login: PASS (API + hosted Playwright UI → `/admin/dashboard`)
provider approval review data: PASS (Provider A approved, Provider B unapproved in admin list). Approve-action not executed (would remove the unapproved control).
users: PASS (`GET /api/admin/customers` 200, includes Customer A and Customer B; Playwright `/admin/customers`)
suppliers: PASS (`GET /api/admin/suppliers` 200; Playwright did not open `/admin/suppliers` this pass)
jobs: PASS (`GET /api/jobs` as admin 200; Playwright `/admin/jobs`)
material orders: PASS (`GET /api/admin/material-orders` 200)
payments: PASS (Playwright `/admin/payments`; `GET /api/admin/financial-summary` 200; `GET /api/admin/payment-obligations` 200)
disputes: PASS (`GET /api/admin/disputes` 200). UI `/admin/disputes` redirects to `/admin/jobs` (existing app mapping; Playwright confirmed)
refunds: PASS (`GET /api/admin/refund-repayments` 200)
restrictions: PASS (`GET /api/admin/payment-obligations` 200)
audit logs: PASS (`GET /api/admin/audit-logs` 200)
fraud: PASS (`GET /api/admin/fraud-alerts` 200)
withdrawals: PASS (`GET /api/admin/withdrawals` 200)
platform health: PASS (`GET /api/admin/platform-health` 200)
analytics: PASS (`GET /api/admin/analytics` 200)

Admin credentials were read from environment configuration only and are not printed here.

---

## 10. Authorization Tests

Anonymous:
`GET /api/auth/me` → 401 PASS
`GET /api/admin/analytics` → 401 PASS
`POST /api/payments/intents/:id/confirm-return` → 401 PASS
invalid JWT `/api/auth/me` → 401 PASS

Customer:
not executed (no staging seed password in operator env)

Provider:
not executed (authenticated). Public list excludes unapproved Provider B: PASS

Supplier:
not executed (authenticated)

Admin:
executed (API + UI). Customer token vs admin API: skipped (needs Customer A login)

CORS (live, this pass):
`Origin: https://elofix.co.za` GET → 200 + ACAO; OPTIONS → 204 + ACAO
`Origin: https://www.elofix.co.za` GET → 200 + ACAO; OPTIONS → 204 + ACAO
`Origin: https://elofix.netlify.app` GET → 200 + ACAO; OPTIONS → 204 + ACAO
`Origin: https://evil.example` GET → 200 **without** ACAO (not 500); OPTIONS → 200 without ACAO

---

## 11. Payment Tests

Deposit: FAIL (hosted two-tranche not run — needs Customer A job)
Completion: FAIL (not run)
Materials: FAIL (not run)
Delivery: FAIL (not run)
Amount tampering: PARTIAL — invalid PayFast ITN POST `/api/payments/webhooks/payfast` → HTTP 400 PASS (rejected; no PAID state created). Full amount-tamper against a real intent not run.
Duplicate webhook: not run hosted (no real ITN)
Return without webhook: anonymous confirm-return 401 PASS. Authenticated return-without-ITN on a live intent not run.
Refund/cancellation: list endpoints PASS; live refund action not run.

`PAYFAST_SETTLE_ON_RETURN` / `PAYFAST_SKIP_IP_CHECK`: not enabled (`/ready` config=ok).

Paystack: NOT IMPLEMENTED in this phase (no Paystack work done).

---

## 12. Realtime Tests

Customer ↔ Provider: FAIL (not run — needs two authenticated browser contexts)
Supplier order: FAIL (not run)
Notifications: FAIL (not run)
Reconnect: FAIL (not run)
Cross-user isolation: FAIL (not run)

---

## 13. Failure Tests

API unavailable: not injected
Expired JWT: invalid JWT 401 PASS
Invalid upload: FAIL (not run)
Oversized upload: FAIL (not run)
S3 failure: N/A (disk opt-out)
Duplicate action: FAIL (not run)
Socket disconnect: FAIL (not run)
Unknown origin CORS: PASS (no HTTP 500)

---

## 14. Responsive Hosted Tests

390×844: PASS (hosted Playwright — Open menu then Sign In reachable)
430×932: PASS
768: PASS
1440: PASS

No Phase B functional blocker found on landing (buttons/navigation reachable). Checkout / job dialogs at those viewports were not exercised without customer login.

---

## 15. Automated Tests

Backend:
files passed: 77 (previous local `npm test` on this branch; not re-run this pass — no application source change)
failed: 0

Frontend lint / Vitest / production build:
previous pass on this branch (lint 0 errors; Vitest 51 files / 288 tests; HTTPS production build PASS). Not re-run this pass — Playwright spec + report + validator script only.

Playwright hosted (`PLAYWRIGHT_BASE_URL=https://elofix.co.za`, `ELOFIX_API_BASE_URL=https://elofix-6136.onrender.com/api`, `ELOFIX_HOSTED_SMOKE=1`):
passed: 6
skipped: 6 (Customer A / Provider A / Supplier / payments PAN / customer-vs-admin / private file id — staging password or file id not set)
failed: 0

Passed:
- landing HTTPS, no localhost API calls
- 390×844 Sign In reachable
- 430 / 768 / 1440 Sign In reachable
- admin UI login
- admin providers / customers / jobs / payments + disputes redirect
- anonymous admin API denied

GitHub Actions:
Backend: pending until PR against `main` is opened
Frontend: pending
Playwright: pending

---

## 16. Bugs Found

No new application P0/P1 reproduced on the live host this pass.

Previously reported P0 (localhost frontend, missing `/ready`, undeployed branch, unseeded accounts) were **not** reproduced:
- `/health` 200, `/ready` 200 with all checks ok
- frontend Network/Playwright uses Render HTTPS
- staging users visible to admin
- CORS allowlist includes apex, www, and Netlify; unknown origin does not 500

Open validation gaps (not proven application defects):
- Operator env missing `STAGING_SEED_PASSWORD`, so customer/provider/supplier/PayFast/realtime/ACL-on-real-files cannot be completed from this session
- Render service restart not performed, so disk persistence after redeploy is unproven
- GitHub CI not yet green on a `main` PR

---

## 17. Known Remaining Issues

P0 (Phase B acceptance — evidence missing, not a reproduced product regression):
- Hosted Customer A full marketplace journey not executed
- Hosted Provider A journey + Provider B authenticated restriction not executed
- Hosted Supplier journey not executed
- Render Disk survive-restart not executed
- Private ACL on real KYC / quotation / job photo / completion objects not executed
- PayFast sandbox DEPOSIT/COMPLETION/MATERIALS hosted flow not executed
- Realtime (two contexts, disconnect/reconnect) not executed

P1:
- GitHub Backend / Frontend / Playwright jobs not yet run against `main` via an open PR

P2:
- MapLibre major-version upgrade remains Phase C
- Hosted JS still contains `localhost:5000` as a compile-time fallback string (not used at runtime on landing)

P3:
- README legacy Firebase starter text remains out of Phase B scope
- UI `/admin/disputes` is a redirect to jobs (existing behaviour; not a Phase B redesign item)

To finish Phase B from this operator: add `STAGING_SEED_PASSWORD` to local `elofix-backend/.env` (do not commit), re-run `node scripts/hosted-phase-b-validate.js` and `npm run e2e:hosted`, then restart the Render web service once and re-check uploads.

---

## 18. Business Logic Confirmation

TWO_PAYMENT_50_50:
UNCHANGED (all 5 live categories)

Deposit 50%:
UNCHANGED (not altered)

Completion 50%:
UNCHANGED (not altered)

EloFix 7%:
UNCHANGED (not altered)

Provider 93%:
UNCHANGED (not altered)

Supplier 7%:
UNCHANGED (not altered)

PaymentIntent:
PRESERVED

Paystack:
NOT IMPLEMENTED

---

## 19. Phase B Final Verdict

PHASE B READY FOR INDEPENDENT REVIEW: NO
