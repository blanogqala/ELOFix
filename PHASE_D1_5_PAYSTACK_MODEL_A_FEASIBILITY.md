# ELOFIX PHASE D1.5 — PAYSTACK MODEL A FEASIBILITY REPORT

Feasibility harness + documentation closeout only. Production Paystack gateway was **not** implemented. PayFast, PaymentIntent settlement, Prisma enums, and frontend were **not** modified.

---

## 1. Repository State

Branch:
`main` (`.git/HEAD` → `refs/heads/main`)

Base SHA:
`5d7436470b2fac12471f2dc6b6ce90caeea0eeb5`

Working tree:
D1.5 isolated harness under `elofix-backend/scripts/paystack-d15/` plus this report. Production payment path unchanged.

---

## 2. EloFix Architecture Re-validation

Inspected current implementation. Authoritative rules are **preserved**.

PaymentIntent:
Server-authoritative amount (`paymentIntent.service.js`). `provider` is persisted.

TWO_PAYMENT_50_50:
Default service schedule via `paymentMode.service.js` + `money.util.splitFiftyFiftySchedule`. **Unchanged.**

7/93 accounting:
`money.util.splitCommission` on **this tranche’s gross**. `commissionAmount` = 7% gross. `recipientAmount` = 93% gross. **Not rewritten.** Paystack fees must never be subtracted into these ledger fields.

Payout destination:
`payoutDestination.service.js` already abstracts banking profiles → gateway recipient. PayFast `supportsMarketplaceSettlement() === false`.

Supplier settlement:
`branchSettlement.initiateSettlementAfterPayment` may call `createSupplierSettlement` only when marketplace settlement is enabled **and** a capable gateway exists. **D2 must not also send a second 93% transfer after a Paystack charge-time split.**

Refund math (`refundMath.util.js`):
- `netCourierCancelRefundFromGross` = gross − 7%
- Comment: **“EloFix keeps commission.”**
- `disputeGrossToLaborNet` / `remainingRefundableLaborGross` refund **paid labor only**, expressed as customer gross then converted to **93% net**
- Unpaid completion is not refundable (`refund.service.refundJobLaborAcrossIntents` FIFO across **paid** LABOR intents)

Dispute (`jobDispute.service.js`, `disputeAdmin.service.js`):
- Dispute cancels unpaid completion-stage intents
- Admin FULL/PARTIAL refund uses `disputeGrossToLaborNet` (7% retained)
- Provider clawback / `RefundRecovery` when provider funds were already accounted

Recovery (`providerRefundClawback.service.js`, `refundRecovery.service.js`):
- Max refundable net = paid labor × 0.93
- Provider refund debt + existing repayment path (`PROVIDER_REFUND_REPAYMENT`)
- Due/restriction uses existing `REFUND_DEBT_DUE_DAYS` / `refundDebtBlockedAt` / marketplace restriction
- After repayment confirmation, customer refund is against the **original** PaymentIntent (`refund.service.refundOriginalPayment` / FIFO paid intents)
- `PROVIDER_REFUND_REPAYMENT` intents are created with `commissionAmount = 0` and `providerPayoutStatus = NOT_APPLICABLE` — they are money **into** EloFix, not a marketplace split

Webhook:
`processWebhookResult` remains the settlement authority. `PROVIDER_REFUND_REPAYMENT` is post-settlement via `markGatewayRepaymentPaidFromIntent`.

Legacy `PaystackCharge` remains unwired. PayFast untouched.

---

## 3. Paystack Test Safety

PAYSTACK_MODE:
Must be `test`. Never inferred from `NODE_ENV`. Unit-tested.

Key prefix:
`sk_live_` → `D1.5 REFUSED LIVE KEY`. `sk_test_` required. Unit-tested.

No secrets logged:
Harness never prints secret key, Authorization header, or full account numbers.

Live charges:
Not used. TEST API only.

`ENABLED_PAYMENT_PROVIDERS` was not set to paystack.

---

## 4. South African Bank Mapping

List Banks result:
**PASS**

Primary query:
`GET /bank?currency=ZAR&enabled_for_verification=true`

Returned **17** supported South African banks (`currency=ZAR`, `country=South Africa`).

EloFix bankName compatibility:
**PARTIAL** — names can be matched after normalization/aliases.

branchCode vs bank_code:
**Confirmed different.** EloFix `branchCode` is not Paystack `code` (e.g. FNB `250655`, Absa `632005`). D2 must store Paystack `bank_code`.

---

## 5. Test Subaccount

Created: **YES** (Paystack TEST domain only; not written to production Prisma)

domain:
`test`

currency:
`ZAR`

percentage_charge:
`7`

active:
`true`

verified:
Operator-confirmed settlement bank mapped. Account numbers not recorded in this report.

---

## 6. Provider Bears Fee

bearer=subaccount: **PASS**

EloFix 7% protected: **PASS**

Recipient bears Paystack fee: **PASS**

Evidence from successful R100 TEST split (cents):

- Gross amount: 10000
- Paystack fee: 449
- Integration / EloFix: 700 (exactly 7% of 10000)
- Subaccount net: 8851
- Expected provider **gross**: 9300
- 9300 − 449 = 8851

EloFix 700 was **not** reduced by the 449 fee. Fee came out of the recipient side.

A second independent R100 TEST charge produced the **same economics**.

---

## 7. Single Split Transaction

Gross:
R100.00 (10000 cents) — TEST payment **success**

Main account gross:
700 cents (R7.00)

Recipient gross:
9300 cents (R93.00)

Paystack fee:
449 cents (Paystack-reported; EloFix does **not** hardcode PSP pricing)

Fee bearer:
`subaccount` — **PASS**

Recipient net:
8851 cents

Bank settlement (real SA bank payout of the subaccount):
**Not sandbox-proven.** TEST `domain=test` success is **not** a claim that live bank settlement occurred. EloFix refund recovery does **not** depend on proving post-bank-settlement Paystack clawback.

---

## 8. 50/50 Split Behaviour

Two independent R100 TEST charges, same 7/93 Model A split (`percentage_charge=7`, `bearer=subaccount`).

Deposit-style tranche:
R100 gross → EloFix R7 / recipient gross R93 / fee on recipient — **PASS**

Completion-style tranche:
Same economics, second successful charge — **PASS**

Total (two TEST charges):
Customer R200; EloFix gross R14; recipient gross R186; PSP fees incurred **twice** (449 cents each on the proven charges).

This must be disclosed later in provider/supplier earnings documentation. Do not hide it.

---

## 9. Full Refund

A **separate** R100 split TEST payment was paid, then a full Paystack TEST refund was accepted:

- refund id `18237078`
- amount 10000 cents
- initial status `pending`

Customer refund API accept: **PASS** (TEST refund created)

Platform share reversal / recipient share reversal / already-settled bank clawback:
**Not used as a D2 blocker.** Public/test evidence does not prove live post-bank-settlement clawback, and EloFix’s **selected** refund architecture does not require it.

EloFix refund policy (code, unchanged):

1. EloFix **retains** the 7% commission (`netCourierCancelRefundFromGross`, `disputeGrossToLaborNet`).
2. Customer refund liability is the provider’s **refundable 93%** of **already-paid** tranches.
3. If provider funds were already released/accounted, create **provider refund debt**.
4. Provider repays via existing `PROVIDER_REFUND_REPAYMENT` (gateway or bank transfer).
5. After recovery/confirmation, refund the **original customer PaymentIntent** (`refundOriginalPayment` / FIFO paid LABOR intents).
6. Do **not** refund unpaid completion. Dispute already cancels unpaid completion intents.

Therefore D2 must **not** convert disputes into a 100% customer-gross Paystack refund that eats EloFix commission, and must **not** wait on Paystack to claw back an already-settled subaccount as the primary recovery path.

Full refund (Paystack TEST API accept): **PASS**  
Already-settled live bank clawback: **not required for EloFix design** (UNPROVEN and **not a blocker**)

---

## 10. Partial Refund

EloFix domain already supports partial refunds of **paid** labor net of 7% (`PARTIAL_REFUND` → `disputeGrossToLaborNet`).

Paystack TEST partial-refund settlement evidence was not required for this closeout. D2 must map partial customer refunds onto original paid intents and provider debt for the **93% net**, never the 7% commission.

---

## 11. Chargeback / Dispute Risk

Paystack:
`charge.dispute.*` webhooks exist. Live chargeback debiting of a settled SA subaccount is **not** TEST-proven.

EloFix mapping (unchanged):

- `JobDispute` — freeze/cancel unpaid completion
- Refund only already-paid labor
- `RefundRecovery` + `ProviderRefundRepayment` if provider already received/accounted the 93%
- `marketplaceRestricted` / `refundDebtBlockedAt` — existing due-day restriction
- Customer gateway refund against **original** PaymentIntent after recovery

A customer-won chargeback is treated like a refund obligation against the **provider 93%**, not as “give back EloFix 7%.” If Paystack debits the merchant for more than EloFix’s policy amount, that is an **ops/reconciliation** risk for D2 logging — it does not rewrite the domain refund policy.

---

## 12. Double-Payout Risk Review

Customer Model A split happens **at charge** (subaccount 93% / main 7%).

D2 must:

- **ADAPT** `createPayoutDestination` to create/update the Paystack subaccount (`percentage_charge=7`)
- Treat `createProviderSettlement` / `createSupplierSettlement` as **NO-OP / STATUS-ONLY** for Paystack split charges
- **Never** split `PROVIDER_REFUND_REPAYMENT` to a provider subaccount (repayment is 100% to EloFix)
- Keep webhook + Verify Transaction as the only settlement authority
- Leave PayFast untouched

Double-payment prevention design: **PASS** (documented; not wired)

---

## 13. Provider / Supplier Pricing Policy

EloFix 7% **gross** marketplace commission (ledger).

Recipient 93% **gross**. Recipient net bank amount may be less after Paystack fees (R93 − fee). That is expected. Do not rewrite `recipientAmount` to the net.

Recipient bears PSP fee (`bearer=subaccount`). Do not hardcode 2.9% / R1 / VAT.

Do not auto-inflate customer prices. Do not add a hidden surcharge.

50/50 means **two** PSP fees on two charges. Disclose later (Phase C), do not implement UI now.

Delivery: keep existing EloFix delivery commission rules; where 7/93 applies, recipient bears PSP fee.

---

## 14. Production Code Changes

**NONE** for payment/dispute/refund business rules.

Harness-only files under `elofix-backend/scripts/paystack-d15/` and `elofix-backend/tests/paystackD15.feasibility.test.js`. `.env.example` comments for TEST variable **names** only.

PayFast: **PRESERVED**  
PaymentIntent / Prisma enums / frontend: **NOT MODIFIED**

---

## 15. Automated Test Results

`node tests/paystackD15.feasibility.test.js`: **PASS** (`paystackD15.feasibility.test.js: all passed`).

Prior targeted payment tests (unchanged production path) passed during D1.5 harness work.

Known unrelated `legalWorkflowAlignment` pool-shutdown flake after PASS is **not** a Paystack issue.

---

## 16. Files Created

Harness (already present):

- `elofix-backend/scripts/paystack-d15/client.js`
- `elofix-backend/scripts/paystack-d15/payload.js`
- `elofix-backend/scripts/paystack-d15/redact.js`
- `elofix-backend/scripts/paystack-d15/banks.js`
- `elofix-backend/scripts/paystack-d15/list-banks.js`
- `elofix-backend/scripts/paystack-d15/create-subaccount.js`
- `elofix-backend/scripts/paystack-d15/initialize-split-test.js`
- `elofix-backend/scripts/paystack-d15/verify-transaction.js`
- `elofix-backend/scripts/paystack-d15/create-refund.js`
- `elofix-backend/scripts/paystack-d15/README.md`
- `elofix-backend/tests/paystackD15.feasibility.test.js`

This closeout updates this report only.

---

## 17. Files Modified

This closeout:

- `PHASE_D1_5_PAYSTACK_MODEL_A_FEASIBILITY.md`

---

## 18. Remaining Paystack Questions

Not D2 blockers for EloFix’s selected refund architecture:

- Live SA **bank** settlement timing of subaccounts (TEST `domain=test` is not live bank proof)
- Live chargeback debiting of a settled subaccount
- Paystack TEST refund `pending` → `processed` dashboard completion

D2 must still:

- Map EloFix `bankName` → Paystack `bank_code` (PARTIAL; store code)
- Initialize customer charges with `subaccount` + `bearer=subaccount` and **no** `transaction_charge`
- Initialize `PROVIDER_REFUND_REPAYMENT` **without** a recipient subaccount
- Keep webhook HMAC + verify + `processWebhookResult` as sole PAID authority

---

## 19. Model A Gate

SA subaccount:
**PASS**

7/93 split:
**PASS**

recipient fee bearer:
**PASS**

50/50 (two independent tranche-style TEST charges):
**PASS**

full refund (TEST API accepted on a separate paid split):
**PASS** (API accept; EloFix domain refund remains 93% net via original intent)

partial refund (EloFix domain):
**PASS** (existing `PARTIAL_REFUND` / 7% retained; Paystack partial not required for closeout)

already-settled refund recovery:
**Not EloFix’s primary design.** Provider debt → repayment → original PaymentIntent refund. Paystack post-bank clawback is **not a D2 blocker**.

double-payment prevention design:
**PASS**

---

## 20. Final Verdict

**D1.5 MODEL A READY FOR D2: YES**

Implementation conditions (D2 must obey; not implemented in D1.5):

A. Preserve existing **7% retained / non-refundable** commission refund policy. Do not refund 100% customer gross.

B. Preserve **provider refund debt / repayment** (`RefundRecovery`, `ProviderRefundRepayment`, due-day restriction).

C. Preserve **original-PaymentIntent** customer refund (`refundOriginalPayment` / FIFO paid LABOR intents).

D. `PROVIDER_REFUND_REPAYMENT` must **never** use a recipient subaccount split. Customer charges use Model A split; repayment is 100% to EloFix.

E. Paystack webhook + server verification remain authoritative. Browser callback does not settle.

F. PayFast remains untouched.

G. D2 must prevent duplicate provider/supplier settlement after Paystack has already split the customer charge (`createProviderSettlement` / `createSupplierSettlement` = status-only / no-op for split charges).

Bank settlement itself is **not sandbox-proven** and is **not required** for EloFix’s refund recovery design.

Paystack production gateway, Prisma `PAYSTACK` enum, and frontend checkout are **not** in this closeout.

STOP.
