# EloFix payments — deployment

## Prerequisites

- PostgreSQL migration applied: `npm run prisma:deploy`
- Public HTTPS API URL (webhooks cannot reach localhost without ngrok)
- Merchant accounts: PayFast, Payflex, PayJustNow (sandbox first)

## Environment

Copy variables from [`.env.example`](../.env.example):

| Variable | Purpose |
|----------|---------|
| `PAYMENT_BASE_URL` | Public API origin (webhook URLs) |
| `FRONTEND_BASE_URL` | Customer return/cancel pages |
| `ENABLED_PAYMENT_PROVIDERS` | Comma list. Example: `payfast,payflex,payjustnow`. Add `paystack` only when Paystack credentials match `PAYSTACK_MODE`. Render blueprint uses `sync: false` so redeploys cannot force PayFast-only. |
| `ALLOW_ADMIN_PAYMENT_OVERRIDE` | `false` in production |
| `MARKETPLACE_SETTLEMENT_ENABLED` | `true` to record Paystack split-at-charge bookkeeping. Recipients must belong to the current `PAYSTACK_MODE` domain (`test` or `live`). |
| `PAYSTACK_MODE` | `test` or `live`. Never inferred from `NODE_ENV`. |
| `PAYSTACK_SECRET_KEY` | `sk_test_…` when mode=test; `sk_live_…` when mode=live. Never commit live keys. Do not switch Render to live during Phase E1. |
| `PAYSTACK_PUBLIC_KEY` | Optional. `pk_test_…` / `pk_live_…` must match `PAYSTACK_MODE`. |

## Webhook URLs (register in each merchant dashboard)

| Provider | URL |
|----------|-----|
| PayFast ITN | `{PAYMENT_BASE_URL}/api/payments/webhooks/payfast` |
| Payflex | `{PAYMENT_BASE_URL}/api/payments/webhooks/payflex` |
| PayJustNow | `{PAYMENT_BASE_URL}/api/payments/webhooks/payjustnow` |
| Paystack | `{PAYMENT_BASE_URL}/api/payments/webhooks/paystack` |

## Paystack transaction identification

Initialize metadata includes `intentId`, `kind`, `paymentType`, `paymentCategory`, `paymentStage`, `paymentLabel`, `jobId`, `materialOrderId`, and `custom_fields` (EloFix Payment / Payment Category / Payment Stage). These labels are built from the server PaymentIntent only.

Paystack `custom_fields` appear on the **transaction detail** in the Paystack dashboard and can be included in the customized “Send CSV to email” export. The Paystack Transactions **list filter** does not provide a native Payment Type dropdown over custom metadata. EloFix does not change `merchantReference` to simulate that filter.

A TEST Paystack subaccount (`gatewayProfilePayload.domain=test`) is unusable when `PAYSTACK_MODE=live`, and a LIVE subaccount is unusable when `PAYSTACK_MODE=test`. Missing domain metadata fails closed and requires re-registration (POST `/subaccount` in the current domain). Never PUT a test ACCT code with live credentials.

Production startup and `GET /ready` fail closed if `paystack` is listed in `ENABLED_PAYMENT_PROVIDERS` but `PAYSTACK_MODE` / key prefixes do not match. Invalid Paystack env does not affect the app when Paystack is not enabled.

## Deploy sequence

1. Set secrets on host (Render / AWS / etc.) — never commit live keys.
2. `npm run prisma:deploy && npm run prisma:generate`
3. Start API: `npm start`
4. Verify `GET /health` → `{ "ok": true }`
5. Smoke-test sandbox checkout (see [PAYMENTS_SANDBOX.md](./PAYMENTS_SANDBOX.md))

## Frontend

Set on Netlify/Vite host:

- `VITE_API_BASE_URL` → your API `/api`
- Optional: `VITE_PAYMENTS_RETURN_BASE`, `VITE_PAYMENTS_CANCEL_BASE` (default: current origin)

Routes: `/payments/return`, `/payments/cancel`

## Refunds

- **Payflex / PayJustNow:** API refunds run automatically before provider clawback when a job or dispute refund is processed.
- **PayFast:** No API refund endpoint. When `refund.status` is `pending_manual_gateway`, ops must issue the refund in the [PayFast merchant dashboard](https://www.payfast.co.za/) using the original payment reference. Internal ledger clawback still applies so provider balances stay correct.
- **Idempotency:** Admin job refunds and dispute resolutions require an `Idempotency-Key` header (frontend sends this automatically).

## Escrow

Labor payments use existing escrow v2 (7% commission, 50% release on pay, 50% on completion). Payment intents record provider and state; settlement runs from verified webhooks.

## AWS (future)

- Store secrets in Secrets Manager
- ALB TLS termination → Express on ECS/EC2
- Optional: SQS queue between webhooks and settlement workers (adapters remain unchanged)

## Monitoring

Log lines include `paymentIntentId`, provider, and state transitions. Alert on repeated webhook signature failures.
