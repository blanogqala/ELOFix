# EloFix payments — sandbox testing

## Local API + ngrok

PayFast ITN requires a public URL:

```bash
cd elofix-backend
npm run dev
ngrok http 5000
```

Set `PAYMENT_BASE_URL=https://YOUR-NGROK-ID.ngrok-free.app` and register ITN URL in PayFast sandbox.

## PayFast

- Sandbox: https://sandbox.payfast.co.za/
- Test merchant ID: `10000100`, key: `46f0cd694581a` (PayFast docs)
- Set `PAYFAST_MODE=sandbox`, `PAYFAST_SKIP_IP_CHECK=true` for local ITN without IP whitelist
- **Localhost / Render sandbox:** With `PAYFAST_MODE=sandbox`, returning from PayFast to `/payments/return` auto-settles the intent (ITN often cannot reach localhost or Render). Disable with `PAYFAST_SETTLE_ON_RETURN=false` if you use ngrok or registered ITNs instead.
- After payment, check `PaymentIntent.state = PAID` and job `laborPaid = true` for labor flows

Replay ITN idempotency:

```bash
node scripts/simulate-payment-webhook.js payfast --reference EF-XXX --status COMPLETE
```

## Payflex

1. Obtain sandbox Client ID / Secret from merchant portal
2. Set `PAYFLEX_MODE=sandbox`
3. Complete hosted checkout; webhook updates intent

## PayJustNow

1. Set `PAYJUSTNOW_MODE=sandbox` and merchant key from portal
2. Checkout: `POST https://sandbox.payjustnow.com/api/v1/merchant/checkout`
3. Confirm webhook updates intent to `PAID`

## Admin force-settle (QA only)

When `NODE_ENV !== production` or `ALLOW_ADMIN_PAYMENT_OVERRIDE=true`:

```http
POST /api/admin/payments/force-settle
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{ "intentId": "<uuid>" }
```

## Customer flows to test

| Flow | Steps |
|------|--------|
| Labor | Job detail → Pay service → gateway → return URL |
| Standalone materials | Order materials wizard → payment modal |
| Job materials | Job → materials purchase flow → gateway |
| Cancel | Cancel job/order → refund status on intent |

## Duplicate payment

Creating two `PAID` intents for the same `jobId` + `LABOR` kind must return 400.
