# ELOFIX PHASE B — HOSTED STAGING VALIDATION REPORT

## 1. Deployment

Frontend URL:
`https://elofix.co.za` (also `https://www.elofix.co.za`, `https://elofix.netlify.app`)

Backend URL:
`https://elofix-6136.onrender.com`

Branch:
`phase-b-hosted-staging-validation`

Commit SHA (hosted at this report):
`4f9e3c08815de80052248628c61f1bd22da46372`

PayFast was not modified after that commit. Remaining Phase B work in this pass is validation-only (report, remaining hosted checks, two-browser E2E).

---

## 2. Environment Validation

Names only. Values not printed.

Render (inferred from `/ready` `config=ok` + `storage=ok`, CORS, and operator confirmation):
`NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` / `FRONTEND_BASE_URL`, `CORS_ALLOWED_ORIGINS`, PayFast sandbox names, `UPLOAD_ROOT`, `ELOFIX_ALLOW_LOCAL_UPLOADS`

Netlify:
`VITE_API_BASE_URL`, `VITE_API_ORIGIN`, `VITE_SOCKET_URL`, `VITE_FRONTEND_URL` (HTTPS Render)

database:
hosted PostgreSQL (staging accounts present)

storage:
Render Disk via `ELOFIX_ALLOW_LOCAL_UPLOADS` + `UPLOAD_ROOT`

sandbox payment:
PayFast. `/ready` `config=ok` means `PAYFAST_SETTLE_ON_RETURN` and `PAYFAST_SKIP_IP_CHECK` are **not** set.

Must **not** be set on staging Render: `PAYFAST_SETTLE_ON_RETURN`, `PAYFAST_SKIP_IP_CHECK`, `ELOFIX_TESTING_MODE`, `ELOFIX_AUTH_RATE_LIMIT_DISABLED`

This operator session loaded `STAGING_SEED_PASSWORD` from local `elofix-backend/.env` (not committed). Password values are not printed.

---

## 3. Health & Readiness

`/health`:
HTTP status: 200
`{"ok":true}`

`/ready`:
HTTP status: 200
`{"status":"ready","checks":{"app":"ok","database":"ok","config":"ok","storage":"ok"}}`

Confirmed again after remaining Phase B checks.

---

## 4. Database

Live `GET /api/categories` returns 5 categories, all `TWO_PAYMENT_50_50`.

Hosted API serves Phase A/B schema. Seeded accounts present:
Customer A/B, Provider A (`approved=true`), Provider B (`approved=false`), Supplier.

Paid service job used for remaining checks:
`93a72902-b65f-4edb-bbf7-71853b55a720`

status=`COMPLETED`, `laborPaid=true`, `paymentProgress=FULLY_PAID`, quoted=`300`, `providerAmount=279`.

---

## 5. Object Storage

Provider KYC upload: PASS (prior hosted pass)
Job photo: PASS (prior hosted pass)
Completion evidence upload + `GET /api/files/:id`: PASS (this pass)
Supplier product image public GET: PASS (prior hosted pass)

Private ACL this pass (completion evidence file):
- anonymous denied: PASS (403)
- Customer B denied: PASS (403)
- Provider B denied: PASS (403)
- supplier denied: PASS (403)
- Customer A (job customer) allowed: PASS (200)
- Provider A (assigned) allowed: PASS (200)

Quotation participant ACL: PASS on prior hosted pass after `9eea59a1`. This paid job has no quotation file attached.

KYC remains owner/admin-only (prior hosted pass).

Restart persistence: files uploaded after later Render redeploys (including this completion-evidence ACL file) still authorize. A dedicated operator Render-restart drill was not repeated in this pass.

---

## 6. Customer Journey

registration: N/A (seeded)
login: PASS (API + hosted Playwright)
profile / categories / location / job create / notifications: PASS (prior hosted pass)
quotation: PASS on prior hosted pass after participant ACL fix; N/A on this paid job (no quotation file)
materials: N/A on this paid service job (no store orders / material orders / materials)
sandbox DEPOSIT: PASS (operator, this Phase B)
sandbox COMPLETION: PASS (operator, this Phase B)
Customer UI Fully paid: PASS (operator)
Customer B isolation: PASS (prior hosted pass)
cancel/dispute: not re-run on the paid completed job (would mutate a successful payment)

Duplicate submit: PASS (prior hosted pass)

---

## 7. Provider Journey

Provider A login: PASS
match / earnings / banking / notifications / KYC / accept / quotation / service price: PASS (prior hosted pass)
Provider UI Fully paid: PASS (operator)
Provider B login / empty match / cannot accept Customer A job / not on public list: PASS (prior hosted pass)

---

## 8. Supplier Journey

login / branch / inventory / product image / orders / notifications / accounting / job isolation: PASS (prior hosted pass)
fulfillment on a live material order: N/A (this paid job has no materials flow)

---

## 9. Admin Journey

login and admin list endpoints: PASS (prior hosted pass).
Approve-action on Provider B was not executed (would remove the unapproved control).

---

## 10. Authorization Tests

Anonymous `/auth/me` 401, admin APIs 401, invalid JWT 401: PASS (prior hosted pass)
Customer denied admin: PASS
Customer B denied Customer A job: PASS
Provider B denied Customer A job / accept: PASS
Supplier denied Customer A job: PASS
Completion-evidence GET/file ACL: PASS (this pass)

CORS (prior hosted pass):
`Origin: https://elofix.co.za` / `www.elofix.co.za` / `elofix.netlify.app` allowed.
`Origin: https://evil.example` GET 200 without ACAO.

---

## 11. Payment Tests

Operator-confirmed hosted service payment (PayFast Sandbox ITN):

| Item | Result |
| --- | --- |
| Service total | R300 |
| DEPOSIT | R150 PAID |
| COMPLETION | R150 PAID |
| Total paid | R300 |
| Balance | R0 |
| Provider share recorded | R279 |
| Customer UI | Fully paid |
| Provider UI | Fully paid |

Real PayFast ITN gates: signature PASS, source IP PASS, server validation PASS, amount PASS, settlement PASS.

Materials payment: N/A (no materials on this job)
Delivery payment: N/A
Amount tampering: invalid ITN still 400 (prior hosted pass)
Return without webhook: production confirm-return does not settle (automated test + `/ready` config)
Refund/cancellation live action: not run on this successful job

`PAYFAST_SETTLE_ON_RETURN` / `PAYFAST_SKIP_IP_CHECK`: not enabled.

Paystack: NOT IMPLEMENTED

PayFast code was not modified in this remaining-validation pass.

---

## 12. Realtime Tests

Job chat persist: PASS (`POST /jobs/:id/chat` 200)
Socket `message:new` to Provider A: PASS (hosted Node client, 20s window)
Reconnect + REST resync includes chat: PASS
Two-browser visual Customer A ↔ Provider A (hosted Playwright, no reload, no mark-complete/dispute): PASS  
(`frontend/e2e/hosted-realtime-two-browser.spec.ts`, 1 passed, job `93a72902-b65f-4edb-bbf7-71853b55a720`)
Supplier order realtime: N/A (no live material order)

---

## 13. Failure Tests

Unknown origin CORS: PASS (prior)
Invalid JWT: PASS (prior)
Duplicate job submit: PASS (prior)
Socket disconnect + REST resync: PASS (this pass)
Invalid / oversized upload: not injected
API unavailable: not injected

---

## 14. Responsive Hosted Tests

390×844 / 430×932 / 768 / 1440 landing Sign In reachable: PASS (prior hosted Playwright)

---

## 15. Automated Tests

Remaining hosted API validator (`node scripts/hosted-phase-b-remaining.js`):
failed=0 total=26

Hosted two-browser Playwright:
passed: 1
failed: 0

Prior hosted Playwright role slice:
passed: 5 + 6 admin/landing
failed: 0

GitHub Actions: to be run on the PR to `main` (not merged from this pass).

---

## 16. Bugs Found

No new P0/P1 in this remaining-validation pass.

Previously reported quotation `GET /api/files/:id` 403 for job customers was fixed in `9eea59a1` and hosted-validated before PayFast ITN work.

Previous `message:new` Node timeout did not reproduce: PASS on this pass.

---

## 17. Known Remaining Issues

Not blocking independent review of Phase B:

- Dedicated Render Disk restart drill was not repeated in this pass (objects uploaded after later deploys still authorize).
- Materials / delivery / supplier fulfillment remain N/A on the confirmed R300 service job.
- GitHub CI must be observed on the PR; this pass does not merge to `main`.

P2: hosted JS may still contain `localhost:5000` as a Vite fallback string (landing previously made no localhost requests). MapLibre upgrade is Phase C.

---

## 18. Business Logic Confirmation

TWO_PAYMENT_50_50:
UNCHANGED (live categories + R300 = R150 + R150)

Deposit 50%:
UNCHANGED (R150 PAID)

Completion 50%:
UNCHANGED (R150 PAID)

EloFix 7%:
UNCHANGED (R300 − R279 = R21)

Provider 93%:
UNCHANGED (R279 recorded)

Supplier 7%:
UNCHANGED (not exercised; no materials job)

PaymentIntent:
PRESERVED (ITN settlement, browser return does not settle)

Paystack:
NOT IMPLEMENTED

---

## 19. Phase B Final Verdict

PHASE B READY FOR INDEPENDENT REVIEW: YES
