# ELOFIX E3 — LIVE PAYSTACK LEGAL ALIGNMENT REPORT

Implementation date: 14 September 2026  
Recommended before broad commercial launch: review the updated marketplace payment, refund, commission, limitation-of-liability and consumer-protection wording with a South African commercial/technology attorney.

This document is an internal implementation record. It is not customer-facing legal advice.

---

## 1. Existing legal architecture audited

The published legal pack already used generic third-party payment-service-provider language, 7%/93% commission wording, PaymentIntent-linked checkout acceptance, role-based `LegalAcceptanceEvent` history, and the public title **Payment Schedule and Transparency Policy** under internal id `escrow-policy`.

Role-required documents (unchanged architecture):

- CUSTOMER: Terms, Privacy
- PROVIDER: Terms, Privacy, Provider Agreement, Refund Policy
- SUPPLIER: Terms, Privacy, Supplier Agreement, Supplier Participation

Checkout still sends the existing `legalAcceptance` payload (Refund Policy; Delivery Policy for materials/delivery).

## 2. Contradictory/outdated wording found

The previous 18 August 2026 pack was directionally correct but still too generic for LIVE Paystack:

- Paystack was not named as the current primary live processor
- Split-at-charge / subaccount settlement was not described
- Gross 93% share was not distinguished from possible net bank credit after processor fees
- Qualified T+2 working-day timing was missing
- Refund 7% wording was too absolute (“the 7% platform fee is not refunded”)
- Refund approved/processed was not clearly separated from customer bank reflection
- Provider verification did not enumerate saved / connected / verified / settled
- Public route remained `/escrow-policy` despite the public title
- Residual “not all Jobs use escrow” wording no longer described the live flow

Internal Prisma/service names (`escrow-policy`, escrow settlement modules, enums) were left unchanged.

## 3. Terms changes

Updated platform-role, payments, and limitation-of-liability sections to state:

- EloFix is a marketplace technology platform
- Payments and supported marketplace settlement are performed through third-party PSPs
- Paystack is currently the primary live processor and may be replaced with notice
- EloFix is not a bank, deposit-taker, wallet provider, insurer or escrow agent
- EloFix does not hold Provider/Supplier settlement funds as customer deposits
- Eligible transactions may be split between EloFix’s 7% commission and a verified Paystack subaccount
- Recording a share is not a bank credit; EloFix does not make a second manual 93% transfer after split-at-charge
- Processor fees may reduce net bank credit; EloFix does not guarantee a settlement date

## 4. Payment Schedule changes

Internal id remains `escrow-policy`. Public title remains **Payment Schedule and Transparency Policy**.

Added live labor flow (Customer pay → Paystack process → 7% / 93% → verified subaccount → bank timing), TWO_PAYMENT_50_50 as two separately commissioned tranches, gross-vs-net 93% language, qualified T+2 disclosure, and “successful payment ≠ bank settlement”.

## 5. Provider Agreement changes

Payments and Settlement now names Paystack, 7%/93% gross share, processor-fee reduction of net credit, no second manual transfer, T+2 (qualified), verification vs settlement, and preserves 30-day refund-repayment obligations.

## 6. Supplier Agreement changes

Commission/payments now distinguishes recorded earning, gross marketplace share, processor fees, verified payout destination, payment confirmation, settlement processing, and final bank credit, with the same generally-T+2 Paystack disclosure.

## 7. Refund Policy changes

Replaced absolute “7% is not refunded” with ordinary retention except where law, card-scheme rules, PSP requirements or a binding determination require otherwise. Documented Approved → Processing → Completed, the six-step sequence, and qualified ~10 business-day bank-reflection guidance. Unpaid remaining tranches remain non-refundable. Implemented refund code was not changed.

## 8. Dispute Policy changes

Refund-processing language now matches Approved → Processing → Completed, states EloFix has not returned money until PSP confirmation, and notes the customer’s bank may update later than EloFix’s completed status. 93% eligible paid labor, ordinary 7% retention, provider repayment and 30-day debt rules are preserved. Dispute backend behavior was not changed.

## 9. Privacy / Data Processing changes

Privacy names Paystack, lists payment data that may be transmitted/received, continues “no full card number or CVV/CVC storage”, and states EloFix stores payment records for accounting, commission, reconciliation, refunds, disputes, audit, fraud prevention and legal compliance.

Data Processing identifies “Paystack and any replacement or additional approved payment service providers used by EloFix” and does not claim Paystack licences.

## 10. Provider Verification changes

New section enumerates four distinct states: banking information saved; Paystack payout destination/subaccount created; Paystack payout destination verified; bank settlement completed. States that Paystack may require verification before settlement and that EloFix does not itself perform bank verification where Paystack does.

## 11. Delivery Policy changes

Light alignment only: Paystack as current primary live processor for materials and delivery-fee payments; payment confirmation is not Provider/Supplier bank settlement.

## 12. Provider/Supplier UI settlement disclosure

Provider Payout & Banking and Supplier branch bank details show concise T+2 text when marketplace settlement is supported / Paystack is connected. “Verified” remains destination-verified, not “paid to bank”.

## 13. Customer checkout Paystack disclosure

PaymentModal now shows a non-checkbox disclosure naming the selected processor, no storage of full card number/CVV, and that refund/cancellation rules apply. Existing Refund/Delivery checkbox and `legalAcceptance` payload are unchanged. No new mandatory checkbox.

## 14. `/payment-schedule` route implementation

Canonical public route is `/payment-schedule` via `LEGAL_ROUTES['escrow-policy']`. The same document (`escrow-policy`) is rendered.

## 15. `/escrow-policy` backwards compatibility

`LEGAL_LEGACY_REDIRECTS['/escrow-policy']` → `/payment-schedule` (`Navigate replace`). Re-acceptance exemptions include both paths.

## 16. Legal versions before → after

| Document | Before | After |
|---|---|---|
| terms | 2026-08-18-r2 | 2026-09-14 |
| privacy | 2026-08-18 | 2026-09-14 |
| providerAgreement | 2026-08-18-r2 | 2026-09-14 |
| refundPolicy | 2026-08-18-r2 | 2026-09-14 |
| escrowPolicy | 2026-08-18-r2 | 2026-09-14 |
| disputeResolution | 2026-08-18-r2 | 2026-09-14 |
| supplierAgreement | 2026-08-18 | 2026-09-14 |
| dataProcessing | 2026-08-18 | 2026-09-14 |
| providerVerification | 2026-08-18 | 2026-09-14 |
| deliveryPolicy | 2026-08-18-r2 | 2026-09-14 |
| Unchanged docs | 2026-08-18 / r2 | unchanged |

Frontend `versions.ts` and backend `legalVersions.js` are synchronized.

## 17. Existing-user re-acceptance behavior

Existing architecture preserved. Bumped required documents make prior acceptances stale. Users can still log in and use exempt paths (legal, jobs/disputes/payments/earnings/contact). Renewed acceptance is required before new marketplace activity where the current flow already enforces it. Accounts are not permanently locked.

## 18. Checkout legal acceptance behavior

`validateCheckoutLegalAcceptance` still requires current Refund Policy version (and Delivery Policy for materials/delivery). Stale refund version still returns 409 `LEGAL_POLICY_VERSION_STALE`. Payload shape unchanged.

## 19. Acceptance-history preservation

`LegalAcceptanceEvent` create-on-accept is unchanged. Historic rows are not rewritten to the latest version. Checkout idempotency still only updates merchant reference on the same intent + same policy versions.

## 20. Confirmation payment engine was NOT modified

No changes to Paystack keys, `PAYSTACK_MODE`, webhooks, PaymentIntent creation/verification, refund execution/finalization, merchantReference, subaccounts, bearer/`percentage_charge`, TWO_PAYMENT_50_50, or PayFast gateway implementation.

## 21. Confirmation 7%/93% calculations were NOT modified

Commission and share calculations were not edited. Legal text describes the existing 7%/93% commercial model.

## 22. Files changed

Legal documents and versions: `frontend/src/lib/legal/versions.ts`, `frontend/src/lib/legal/documents/{terms,payment-policies,core-agreements,supplier-policies,dispute-policies,privacy,privacy-ext,trust-policies,delivery-policy}.ts`, `frontend/src/lib/legal/checkoutAcceptance.ts`, `elofix-backend/src/config/legalVersions.js`

UI/routes: `frontend/src/App.tsx`, `frontend/src/pages/legal/pages.ts`, `frontend/src/components/legal/{LegalPageLayout,LegalReacceptanceModal}.tsx`, `frontend/src/components/jobs/AdminRequiredCompletionPaymentBlock.tsx`, `frontend/src/components/payments/PaymentModal.tsx`, `frontend/src/components/provider/ProviderPayoutBankingPanel.tsx`, `frontend/src/components/supplier/BranchBankDetailsTab.tsx`, `frontend/src/pages/user/Payments.tsx`, `frontend/src/lib/payoutBankingDisplay.ts`

Tests: listed in section 23.

No Prisma migration.

## 23. Tests added/changed

Added: `frontend/src/lib/legal/livePaystackAlignment.test.ts`, `frontend/src/lib/legal/legalRoutes.test.ts`, `frontend/src/pages/legal/PaymentSchedulePage.test.tsx`, `elofix-backend/tests/legalPaystackAlignment.test.js`

Updated: legal identity/workflow tests, checkoutAcceptance, PaymentModal, payout display, Provider/Supplier payout panels, backend legalWorkflowAlignment version assertions.

## 24. Exact commands run

```
cd elofix-backend
npx prisma generate
npx prisma validate
node tests/legalPaystackAlignment.test.js
node tests/legalWorkflowAlignment.test.js
node tests/checkoutLegalAcceptance.test.js
npm test

cd frontend
npx vitest run src/lib/legal src/lib/legalWorkflowAlignment.test.ts src/lib/legalIdentity.test.ts src/lib/payoutBankingDisplay.test.ts src/components/payments/PaymentModal.test.tsx src/components/provider/ProviderPayoutBankingPanel.test.tsx src/components/supplier/BranchBankDetailsTab.test.tsx src/pages/legal/PaymentSchedulePage.test.tsx src/lib/legal/checkoutAcceptance.test.ts
npm run lint
npm test
# production build:
VITE_API_ORIGIN=https://elofix-6136.onrender.com
VITE_API_BASE_URL=https://elofix-6136.onrender.com/api
VITE_SOCKET_URL=https://elofix-6136.onrender.com
npm run build
```

Hosted Playwright against live EloFix was not run (no live payment or refund in this task).

## 25. Exact results

- `npx prisma generate`: success (Prisma Client v7.7.0)
- `npx prisma validate`: schema valid
- Backend legal tests: passed (including DB checkout legal acceptance)
- Backend `npm test`: **95 files passed**, exit 0
- Frontend targeted vitest: 10 files / 55 tests passed
- Frontend `npm run lint`: 0 errors, 2 pre-existing `react-hooks/exhaustive-deps` warnings on payout panels
- Frontend `npm test`: **61 files / 355 tests passed** + productionFrontendConfig.test.mjs passed
- Production build: success (`✓ built in 13.23s`) with HTTPS Render API origin

## 26. Remaining risks

- Paystack T+2 and refund bank-reflection timing can change; wording is qualified, not a guarantee
- PayFast remains an available gateway; checkout names the selected processor rather than always saying Paystack
- Internal `escrow-policy` id remains for compatibility
- Existing users must re-accept bumped documents before new marketplace activity
- `frontend/public/_headers` was regenerated by the production build to the Render API origin
- Git was not available in this environment, so the recommended branch was not created here

## 27. Attorney-review items

Recommended before broad commercial launch: review the updated marketplace payment, refund, commission, limitation-of-liability and consumer-protection wording with a South African commercial/technology attorney.

In particular: marketplace vs payment-institution characterisation; split-at-charge vs escrow; 7% ordinary retention vs CPA/card-scheme mandatory refunds; T+2 and refund timing disclosures; POPIA payment-data sharing with Paystack; provider refund-repayment and 30-day debt language.

## 28. Final verdict

**LIVE PAYSTACK LEGAL ALIGNMENT READY: YES**
