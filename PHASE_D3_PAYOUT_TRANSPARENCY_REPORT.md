# Phase D3 — Payout Transparency & Settlement Reconciliation

Implementation report. No commit or merge was made.

## A. Current problems found

1. Provider History hardcoded a green **Settled** badge on every PAID PaymentIntent stage.
2. Provider group labels **Fully settled / Partially settled** meant customer stages paid, not bank payout.
3. Paystack `alreadySplitSettlementResult` returned `COMPLETE`, which mapped supplier `BranchSettlementStatus` to **SETTLED** at charge time using the **transaction id** as `settlementId`.
4. `providerPayoutStatus=COMPLETE` means share recorded, not bank settlement.
5. `fees_split` existed on `gatewayPayload` but was not persisted as money columns or shown in UI.
6. Paystack settlement retrieval / settlement webhooks were stubs; charge webhooks ignored settlement events.

## B. Existing architecture reused

- `PaymentIntent` ledger and cents-safe `splitCommission` (7/93) — **unchanged**.
- Paystack split-at-charge (`subaccount` + `bearer=subaccount`) — **unchanged**.
- `processWebhookResult` remains customer-payment authority.
- `createProviderSettlement` / `createSupplierSettlement` remain no-op / no `/transfer`.
- `BranchSettlementEvent` remains the supplier event log.
- Provider `GET /api/provider/earnings` `settlementRecords` extended additively.
- Notification `dedupeKey` + `emitDomainUpdate` + `useRealtimeDomainSync`.
- Existing interval-job pattern for hourly Paystack settlement reconcile.

## C. Database / schema changes

Additive migration `20260915140000_payout_transparency_settlement`:

- Enums `PayoutSettlementStatus`, `PayoutRecipientType`
- Models `GatewayPayoutSettlement`, `GatewayPayoutSettlementItem`, `GatewayPayoutSettlementEvent`
- `PaymentIntent` columns: `processorFeeAmount`, `expectedBankSettlementAmount`, `payoutSettlementStatus`, `payoutSettlementId`
- Backfill: repayment `NOT_APPLICABLE`; non-Paystack paid marketplace `NOT_SUPPORTED`; Paystack paid marketplace `PROCESSING`
- Historical false `SETTLED` (transaction-id placeholders) reinterpreted as `PROCESSING`

No PaymentIntent amounts rewritten. No SETTLED backfill.

## D. Paystack reconciliation

- Charge time: persist fee from `fees_split.paystack` when `bearer=subaccount`; set `payoutSettlementStatus=PROCESSING`
- `alreadySplitSettlementResult.status` is now `PROCESSING` (still `alreadySplitAtCharge`, no Transfer API)
- Hourly job `paystackSettlementReconcile.job.js` (`GET /settlement` + `GET /settlement/:id/transactions`)
- Env: `DISABLE_PAYSTACK_SETTLEMENT_RECONCILE_CRON`
- Admin: `POST /api/admin/payout-settlements/reconcile`
- Settlement webhook: HMAC on raw body, ignore `transfer.*`, fetch/apply settlement by id, never `processWebhookResult`

One Paystack settlement can attach many PaymentIntents. Re-runs upsert; no duplicate charges/splits/transfers.

## E. Provider UI

- KPI: **Customer payments received**
- History heading: **Customer payments received**
- Group labels: All / Some customer payments confirmed
- Stage badge: **Payment confirmed** plus payout breakdown/status
- `PayoutBreakdown` shows customer / 7% / gross share / Paystack fee / expected bank / payout status

## F. Supplier UI

- Shared `SettlementStatusBadge` (`SETTLED` → Settled by Paystack)
- History tables: fee, expected bank, truthful status
- KPI subtitle: Verified Paystack bank settlements
- Branch access unchanged (`assertBranchInventoryAccess`)

## G. Admin

- Job GET (admin/provider): additive `payoutReconciliations[]`
- Admin Payment Detail / `AdminJobPaymentBreakdownCard` shows per-intent reconciliation
- Customer job payload does not receive this list

## H. Invoice / statement

- Customer invoices unchanged (still customer paid amount)
- Provider Payment Details dialog adds payout/settlement breakdown
- No customer Invoice rows created for payouts

## I. Processor fee handling

- Authoritative `fees_split.paystack` only (cents → ZAR via `money.util`)
- Unknown / contradictory / fee > share → both fee and expected bank **null**
- Never written into `commissionAmount` / `recipientAmount`

## J. Notifications / realtime

- Charge-time: PENDING → PROCESSING (deduped)
- Reconcile: PROCESSING → SETTLED / FAILED / REVERSED (deduped)
- No notify on backfill or no-op reconcile
- `domain: earnings` also invalidates supplier + admin query prefixes

## K. Security / authZ

- Secret key backend-only; frontend never calls Paystack
- Metadata minimized (no secrets, no full bank numbers)
- Provider earnings still scoped by `recipientUserId`
- Branch history still `requireBranchAccess`
- Admin reconcile is ADMIN-only
- Customer `serializeIntent` was not given payout/bank fields

## L. Tests added

- `elofix-backend/tests/payoutTransparency.test.js`
- `elofix-backend/tests/paystack.settlementReconcile.test.js`
- `frontend/src/lib/payoutDisplay.test.ts`
- `frontend/src/components/provider/ProviderSettlementJobGroups.test.tsx`

## M. Existing tests run

Passed:

- payoutTransparency.test.js
- paystack.settlementReconcile.test.js
- paystack.settlement.bookkeeping.test.js (now expects PROCESSING)
- paystack.settlementGatewayBind.test.js (now expects PROCESSING, still no `/transfer`)
- paystack.gateway.test.js
- paystack.refund.commissionCap.test.js
- frontend payoutDisplay / providerSettlementGroups / branchSettlementDisplay / ProviderSettlementJobGroups

## N. Migration / deployment

1. Deploy migration `20260915140000_payout_transparency_settlement` before code that reads new columns
2. Supplier “Settled” KPI will drop until reconcile attaches real Paystack settlement ids (expected)
3. Optional: `DISABLE_PAYSTACK_SETTLEMENT_RECONCILE_CRON=true` where Paystack is not configured

## O. Files changed (principal)

Backend: Prisma schema + migration; `money.util.js`; `payoutTransparency.util.js`; `payoutTransparency.service.js`; `paystack.payload.js`; `paystack.gateway.js`; `paystack.settlementReconcile.service.js`; `webhook.service.js`; `branchSettlement.service.js`; `providerAccount.service.js`; `payment.controller.js`; `job.controller.js`; `admin.controller.js` + routes; `platformHealth.service.js`; `server.js`; `jobs/paystackSettlementReconcile.job.js`

Frontend: `payoutDisplay.ts`; `SettlementStatusBadge`; `PayoutBreakdown`; Provider earnings groups/page; supplier history/KPI; admin breakdown; ProviderPaymentDetailsDialog; `useRealtimeDomainSync`; types/API types

## P. 7/93 confirmation

**7% EloFix commission and 93% recipient gross share were not changed.** Refund commission protection tests remain green. No Transfer API. No second payout. PayFast ITN untouched.

## Q. Remaining risks / assumptions

- Paystack TEST settlements may not prove live SA bank credit; UI never claims “money received in your bank”
- If Paystack omits `fees_split.paystack` or `bearer`, fee stays unknown until settlement transactions include it
- Settlement webhook depends on Paystack sending `settlement.*` events; hourly GET /settlement is the primary path
- Historical SETTLED-without-real-settlement-id is PROCESSING until reconcile
