# EloFix dependency security audit (Phase A)

Classification of `npm audit` HIGH and CRITICAL findings after clean lockfile refresh.

No secrets are recorded here. `npm audit fix --force` was not used.

## Policy applied

- Patch/minor upgrades and npm `overrides` for compatible majors only.
- Prisma stayed on 7.x (no major upgrade or advertised downgrade to 6.19.3).
- Paystack was not added.

## Backend (`elofix-backend`)

### Runtime HIGH/CRITICAL after this pass

| Package | Severity | Runtime/Dev | Direct/Transitive | Fix applied | Remaining reason |
| --- | --- | --- | --- | --- | --- |
| multer | High | Runtime (multipart uploads) | Direct | Yes — `2.3.0` | — |
| socket.io-parser | High | Runtime (Socket.IO) | Transitive | Yes — override `4.2.7` | — |
| ws | High | Runtime (Socket.IO / engine.io) | Transitive | Yes — override `8.21.3` | — |

**Backend critical runtime: 0**

**Backend high runtime: 0** (upload and realtime stacks patched)

### Remaining (not API request-path)

| Package | Severity | Runtime/Dev | Direct/Transitive | Fix applied | Remaining reason |
| --- | --- | --- | --- | --- | --- |
| prisma / @prisma/config / deepmerge-ts | High | Deploy/CLI (`prisma generate`, `migrate`) | Direct + transitive | No | Advertised fix is Prisma **6.19.3** (major downgrade). Forbidden. Not loaded by `node server.js`. |
| mysql2 | High | Prisma CLI / `@prisma/dev` only | Transitive | No | EloFix uses PostgreSQL via `pg`. mysql2 is not on the API query path. |
| hono | High | Prisma CLI / `@prisma/dev` only | Transitive | No | Not used by the Express API. |
| fast-uri | High | Prisma CLI (`ajv` under `@prisma/dev`) | Transitive | No | Not on the API request path. |
| brace-expansion | High | Dev (`nodemon` → minimatch) | Transitive | No | Development watcher only. |

## Frontend (`frontend`)

### Runtime findings with a safe compatible fix — applied

| Package | Severity | Runtime/Dev | Direct/Transitive | Fix applied | Remaining reason |
| --- | --- | --- | --- | --- | --- |
| axios | High | Runtime (API client) | Direct | Yes — `1.20.0` | — |
| react-router-dom / @remix-run/router | High | Runtime (routing) | Direct | Yes — `6.30.6` | — |
| socket.io-parser | High | Runtime (socket.io-client) | Transitive | Yes — override `4.2.7` | — |
| ws | High | Runtime (engine.io-client) | Transitive | Yes — override `8.21.3` | — |
| protobufjs | Critical | Firebase Firestore loader | Transitive | Yes — override `7.6.6` | — |
| websocket-driver | Critical | Firebase Realtime Database | Transitive | Yes — override `0.7.5` | — |

### Remaining

| Package | Severity | Runtime/Dev | Direct/Transitive | Fix applied | Remaining reason |
| --- | --- | --- | --- | --- | --- |
| maplibre-gl | Critical | Runtime (maps) | Direct | No | CVE-2026-85061 XSS in attribution sanitizer. Fixed only in **6.4.1+**. Current app is **4.7.x**. 4→6 is a breaking map API upgrade (delivery tracking UI). EloFix feeds MapTiler/OpenFreeMap style URLs, not user-supplied attribution HTML. Deferred; do not treat as currently attacker-controlled in this product. |
| xlsx | High | Runtime (supplier/admin Excel export) | Direct | No | No patched release on npm. Replacing SheetJS would be an unrelated rewrite. |
| vitest | Critical | Dev-only test runner | Direct | No | Not shipped in the Netlify bundle. |
| vite / rollup / postcss / browserslist / sharp | High | Build-time | Direct or transitive | No | Not executed on the production API. sharp major 0.35 is breaking. |
| brace-expansion / minimatch / glob / picomatch / flatted / js-yaml / lodash / nanoid | High | Dev/build (ESLint, Vitest, glob) | Transitive | No | Not in the deployed browser server. |
| undici / @grpc/grpc-js | High | Firebase Node adapters | Transitive | No | Browser Firebase Auth/Firestore does not execute these Node adapters. Remaining on firebase@10. Safe firebase 11+ would be a major. |

**Frontend critical runtime (exploitable in EloFix’s current map/style pipeline): 0 currently reachable**

**Frontend critical library still present: maplibre-gl 4.x (breaking upgrade required)**

**Frontend high runtime with no safe fix: xlsx (SheetJS, no patched npm release)**

## Commands used

```bash
cd elofix-backend && npm audit
cd frontend && npm audit
```

Do not run `npm audit fix --force`.
