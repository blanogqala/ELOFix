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
| `ENABLED_PAYMENT_PROVIDERS` | Comma list: `payfast,payflex,payjustnow` |
| `ALLOW_ADMIN_PAYMENT_OVERRIDE` | `false` in production |

## Webhook URLs (register in each merchant dashboard)

| Provider | URL |
|----------|-----|
| PayFast ITN | `{PAYMENT_BASE_URL}/api/payments/webhooks/payfast` |
| Payflex | `{PAYMENT_BASE_URL}/api/payments/webhooks/payflex` |
| PayJustNow | `{PAYMENT_BASE_URL}/api/payments/webhooks/payjustnow` |

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

## Escrow

Labor payments use existing escrow v2 (7% commission, 50% release on pay, 50% on completion). Payment intents record provider and state; settlement runs from verified webhooks.

## AWS (future)

- Store secrets in Secrets Manager
- ALB TLS termination → Express on ECS/EC2
- Optional: SQS queue between webhooks and settlement workers (adapters remain unchanged)

## Monitoring

Log lines include `paymentIntentId`, provider, and state transitions. Alert on repeated webhook signature failures.
