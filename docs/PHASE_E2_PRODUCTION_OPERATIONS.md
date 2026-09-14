# EloFix Phase E2 — production operations runbook

Operational guide for **realtime**, **CORS**, **uploads**, **backups**, and **Render/Netlify** configuration. This document does **not** store secret values and does **not** claim that backups exist unless an operator has verified them.

Related: [DEPLOYMENT.md](DEPLOYMENT.md), [elofix-backend/docs/IMAGE_STORAGE_DEPLOY.md](../elofix-backend/docs/IMAGE_STORAGE_DEPLOY.md), [elofix-backend/docs/PAYMENTS_DEPLOYMENT.md](../elofix-backend/docs/PAYMENTS_DEPLOYMENT.md).

Phase E2 does **not** switch Paystack to live credentials and does **not** change payment split / refund math.

---

## Diagnosing `/socket.io` 502 vs CORS

A production browser may show:

- repeated `/socket.io/?EIO=4&transport=polling`
- `502 Bad Gateway`
- a CORS error because the 502 body has no `Access-Control-Allow-Origin`

Treat these as **different** failures:

| Symptom | Likely class |
| --- | --- |
| Handshake returns **502/503/504** (no EloFix JSON) | Hosting/proxy, process restart, or wrong upstream |
| Handshake returns **200** with Engine.IO payload `0{...}` | Backend Socket.IO is up |
| Handshake returns **4xx** with CORS missing for the **frontend origin** | Application CORS allowlist |
| Frontend connects to `https://elofix.co.za/socket.io` | Wrong socket origin (Netlify does not proxy Socket.IO unless explicitly configured) |
| Frontend connects to `http://localhost:5000` in production | Stale/missing `VITE_API_BASE_URL` / `VITE_SOCKET_URL` |
| `/ready` `realtime: not_ready` | Socket.IO failed to initialize |

Netlify in this repo does **not** proxy `/socket.io` to Render. Production browsers must open Socket.IO against the **Render API origin**.

---

## Realtime architecture (preserved)

- One Node HTTP server; Socket.IO is attached to that server (`path=/socket.io`).
- Transports: `polling` then `websocket` upgrade. Do not force websocket-only without a hosted proof.
- Exact CORS allowlist shared with Express (`FRONTEND_URL`, `FRONTEND_BASE_URL`, `CORS_ALLOWED_ORIGINS`).
- JWT in Socket.IO **handshake auth** (never query string).
- Room joins authorized server-side (`join`, `order:join` / `join_order`, `update_location`).
- Tracking HTTP polling fallback remains in `useOrderLocationSocket`.
- Notification **SOCKET** delivery is acceleration; durable `Notification` rows are source of truth.

If EloFix later runs **multiple backend instances**, Socket.IO rooms will need a shared adapter (for example Redis). E2 does **not** add Redis for a single Render web service.

---

## Environment variables

### Render (backend)

Names only — set values in the Render dashboard:

| Name | Expected production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://elofix.co.za` |
| `FRONTEND_BASE_URL` | `https://elofix.co.za` |
| `CORS_ALLOWED_ORIGINS` | Extra **exact** browser origins only (e.g. `https://www.elofix.co.za` and a Netlify hostname **if** those hosts are used). No `*`. |
| `PAYMENT_BASE_URL` | Public Render API origin (`https://<api-host>`) |
| `UPLOAD_ROOT` | Absolute disk mount (e.g. `/opt/render/project/src/uploads`) when using a Render Disk |
| `ELOFIX_ALLOW_LOCAL_UPLOADS` | `true` **only** with a verified persistent disk; otherwise omit and use S3/R2 |

`www` and Netlify hostnames are **not** implied by the apex origin. Add them explicitly if the browser uses them.

### Netlify (frontend)

Production build **fails closed** on missing/localhost API URLs.

| Name | Expected production value |
| --- | --- |
| `VITE_API_ORIGIN` | Render API origin |
| `VITE_API_BASE_URL` | Render API origin + `/api` |
| `VITE_SOCKET_URL` | **Optional.** Explicit Render API origin. Not required when `VITE_API_BASE_URL` already points at Render. |
| `VITE_FRONTEND_URL` | `https://elofix.co.za` (or the live frontend host) |

Do not point `VITE_SOCKET_URL` at `https://elofix.co.za` unless that host actually proxies `/socket.io`.

---

## Probes and log markers

- `GET /health` — process up only. Not DB, not Socket.IO, not Paystack.
- `GET /ready` — `{ checks: { app, database, config, storage, realtime } }`. `realtime` is `ok` only after Socket.IO is initialized. `config` is `invalid` when production payment safety **or** production CORS frontend origins fail.

Useful log prefixes (never JWT, Authorization, bank/KYC, chat bodies, or GPS coordinates):

- `[FATAL]` startup / listen / Socket.IO init
- `[ready]` unavailable probe
- `[socket]` connect / disconnect / origin_rejected / auth_failed / join_rejected / location_rejected
- `[notificationOutbox]` tick summary and `DEAD` rows
- `[webhook]` / `[payfast-itn]` / `[paystack-webhook]` already used by payment code (E2 does not change payment files)

**Sentry / APM:** not installed. Optional post-launch; **not** an E2 launch blocker. Use Render logs + `/health` + `/ready` first.

---

## Direct Socket.IO smoke (no UI)

From `elofix-backend`:

```bash
ELOFIX_SOCKET_BASE_URL=https://YOUR-RENDER-API.onrender.com npm run smoke:socket
```

Optional JWT (never print it): `ELOFIX_SOCKET_TOKEN`.

Exits `0` on connect, non-zero on timeout / 5xx / 502.

---

## Hosted two-browser realtime test (opt-in, non-destructive)

From `frontend`:

```bash
ELOFIX_HOSTED_SMOKE=1 ^
PLAYWRIGHT_BASE_URL=https://elofix.co.za ^
ELOFIX_SOCKET_BASE_URL=https://YOUR-RENDER-API.onrender.com ^
E2E_REALTIME_JOB_ID=<existing-paid-job-id> ^
STAGING_CUSTOMER_A_PASSWORD=... ^
STAGING_PROVIDER_A_PASSWORD=... ^
npm run e2e:hosted-realtime
```

Does **not** complete jobs, open disputes, or change payment state. Passwords must come from the environment, never Git.

---

## Upload storage

Production `/ready` storage is valid when:

1. S3/R2 credentials are present (`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`), **or**
2. `ELOFIX_ALLOW_LOCAL_UPLOADS=true` **and** `UPLOAD_ROOT` is an **explicit absolute** path.

The app cannot prove a Render Disk is physically attached. Operators must confirm the disk in the Render UI (mount path matches `UPLOAD_ROOT`).

Do not delete existing uploads. Do not run an automatic file migration.

---

## PRE-LIVE BACKUP CHECKLIST

Do not tick these as done unless an operator has verified them in the provider consoles.

### DATABASE

- [ ] Identify the **production** PostgreSQL instance (Render dashboard → the service `DATABASE_URL` points at). Do not assume a blueprint `elofix-db` name without checking.
- [ ] Confirm who is responsible for backups (Render managed backup / point-in-time, or external `pg_dump` schedule).
- [ ] Verify backup availability in that provider UI (latest snapshot time, retention).
- [ ] Perform a **restore test** onto a **non-production** database. Never restore over production to “see if it works”.
- [ ] Record the restore-test date and the backup timestamp used.

### UPLOADS — Render persistent disk

- [ ] Disk is attached to the production web service.
- [ ] Mount path matches `UPLOAD_ROOT` (absolute).
- [ ] `ELOFIX_ALLOW_LOCAL_UPLOADS=true` only because that disk is persistent (not Free ephemeral disk).
- [ ] Persistence check: upload a non-sensitive test file, restart/redeploy, confirm the file still exists.
- [ ] Backup/export plan exists (disk snapshot, `rsync`/`tar` off-box, or migrate to S3/R2). Application code does not configure Render disk snapshots.

### UPLOADS — S3 / R2

- [ ] Bucket name recorded (not the secret key).
- [ ] Versioning and/or lifecycle rules reviewed.
- [ ] Access-key rotation owner and interval recorded.

### APP / DEPLOYMENT INVENTORY

- [ ] GitHub `main` commit SHA currently deployed.
- [ ] Render deploy id / timestamp for the API.
- [ ] Netlify deploy id / timestamp for the frontend.
- [ ] Environment-variable **names** inventoried (Render + Netlify). **No secret values in this document or in Git.**

### PAYMENTS (do not change in E2)

- [ ] Paystack webhook URL = `{PAYMENT_BASE_URL}/api/payments/webhooks/paystack`
- [ ] Paystack mode remains whatever is already configured (E2 does **not** switch TEST → LIVE)
- [ ] `ENABLED_PAYMENT_PROVIDERS` recorded
- [ ] PayFast ITN URL unchanged

---

## Restore notes

- Restore Postgres onto a scratch instance; point a **staging** API at it; never overwrite production.
- Disk restore: attach a restored disk to a staging service with a different `UPLOAD_ROOT` if needed.
- After restore, confirm `GET /health` and `GET /ready` before sending browser traffic.

---

## Multi-instance note

Single Render `elofix-api` web service: in-process Socket.IO rooms are sufficient. Two or more API instances require a Socket.IO Redis (or equivalent) adapter before sticky sessions or a shared adapter is configured. Do not add Redis until that hosting change is real.
