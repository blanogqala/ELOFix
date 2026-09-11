# Paystack D1.5 TEST-MODE harness

Isolated feasibility scripts. Not production checkout. Do not enable Paystack in `ENABLED_PAYMENT_PROVIDERS`.

Requires local `.env` (never commit values):

- `PAYSTACK_MODE=test`
- `PAYSTACK_SECRET_KEY` beginning with `sk_test_`
- Dedicated `PAYSTACK_D15_TEST_*` bank/email fields (not real provider/supplier profiles)

Live keys (`sk_live_`) are refused with `D1.5 REFUSED LIVE KEY`.

```
node scripts/paystack-d15/list-banks.js
node scripts/paystack-d15/create-subaccount.js
node scripts/paystack-d15/initialize-split-test.js 100 deposit
node scripts/paystack-d15/verify-transaction.js <reference>
node scripts/paystack-d15/create-refund.js <reference>
node scripts/paystack-d15/create-refund.js <reference> 40
```

Complete Paystack TEST checkout in the browser when `authorization_url` is printed. Do not simulate success.
