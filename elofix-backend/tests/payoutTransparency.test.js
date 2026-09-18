const { Prisma } = require("@prisma/client");
const assert = require("assert");
const { splitCommission, computeExpectedBankSettlement } = require("../src/services/payments/money.util");
const {
  processorFeeFromPaystackEvidence,
  feeFromSettlementTransaction,
  payoutColumnsForPaidIntent,
  toPublicPayoutBreakdown,
  mapPaystackSettlementApiStatus,
  shouldRepairFalseChargeTimeProcessing,
  resolveAuthoritativeProcessorFee,
} = require("../src/services/payments/payoutTransparency.util");

function run() {
  const split = splitCommission(100);
  assert.strictEqual(Number(split.commissionAmount), 7);
  assert.strictEqual(Number(split.recipientAmount), 93);

  const known = computeExpectedBankSettlement(93, 2.82);
  assert.strictEqual(Number(known.processorFeeAmount), 2.82);
  assert.strictEqual(Number(known.expectedBankSettlementAmount), 90.18);

  const unknown = computeExpectedBankSettlement(93, null);
  assert.strictEqual(unknown.processorFeeAmount, null);
  assert.strictEqual(unknown.expectedBankSettlementAmount, null);

  const tooLarge = computeExpectedBankSettlement(93, 100);
  assert.strictEqual(tooLarge.processorFeeAmount, null);
  assert.strictEqual(tooLarge.expectedBankSettlementAmount, null);

  const fee = processorFeeFromPaystackEvidence({
    bearer: "subaccount",
    fees_split: { paystack: 282, integration: 700, subaccount: 9018 },
  });
  assert.ok(fee instanceof Prisma.Decimal);
  assert.strictEqual(Number(fee), 2.82);

  const noFee = processorFeeFromPaystackEvidence({ bearer: "account" });
  assert.strictEqual(noFee, null);

  const feesOnly = processorFeeFromPaystackEvidence(
    { fees: 282, fees_split: null },
    { provider: "PAYSTACK", kind: "LABOR" }
  );
  assert.strictEqual(Number(feesOnly), 2.82);

  const missingAll = processorFeeFromPaystackEvidence(
    { bearer: "subaccount", fees: null, fees_split: null },
    { provider: "PAYSTACK", kind: "LABOR", amount: 50, recipientAmount: 46.5 }
  );
  assert.strictEqual(missingAll, null);

  const mainAccountFeesIgnored = processorFeeFromPaystackEvidence(
    { bearer: "account", fees: 282 },
    { provider: "PAYSTACK", kind: "LABOR" }
  );
  assert.strictEqual(mainAccountFeesIgnored, null);

  const paystackPaid = payoutColumnsForPaidIntent(
    {
      kind: "LABOR",
      provider: "PAYSTACK",
      amount: new Prisma.Decimal("50.00"),
      commissionAmount: new Prisma.Decimal("3.50"),
      recipientAmount: new Prisma.Decimal("46.50"),
    },
    { fees: 282, fees_split: null, status: "success", gateway_response: "Approved", message: "Approved" }
  );
  assert.strictEqual(paystackPaid.payoutSettlementStatus, "PENDING");
  assert.notStrictEqual(paystackPaid.payoutSettlementStatus, "PROCESSING");
  assert.notStrictEqual(paystackPaid.payoutSettlementStatus, "SETTLED");
  assert.strictEqual(Number(paystackPaid.processorFeeAmount), 2.82);
  assert.strictEqual(Number(paystackPaid.expectedBankSettlementAmount), 43.68);

  const splitPaid = payoutColumnsForPaidIntent(
    {
      kind: "LABOR",
      provider: "PAYSTACK",
      recipientAmount: new Prisma.Decimal("93.00"),
    },
    { bearer: "subaccount", fees_split: { paystack: 282 } }
  );
  assert.strictEqual(splitPaid.payoutSettlementStatus, "PENDING");
  assert.strictEqual(Number(splitPaid.processorFeeAmount), 2.82);

  const noEvidenceFee = payoutColumnsForPaidIntent(
    {
      kind: "LABOR",
      provider: "PAYSTACK",
      amount: 50,
      commissionAmount: 3.5,
      recipientAmount: 46.5,
    },
    { status: "success", gateway_response: "Approved", message: "Approved" }
  );
  assert.strictEqual(noEvidenceFee.payoutSettlementStatus, "PENDING");
  assert.strictEqual(noEvidenceFee.processorFeeAmount, null);

  const payfastPaid = payoutColumnsForPaidIntent(
    { kind: "LABOR", provider: "PAYFAST", recipientAmount: 93 },
    {}
  );
  assert.strictEqual(payfastPaid.payoutSettlementStatus, "NOT_SUPPORTED");
  assert.strictEqual(payfastPaid.processorFeeAmount, null);

  const repayment = payoutColumnsForPaidIntent(
    { kind: "PROVIDER_REFUND_REPAYMENT", provider: "PAYSTACK", recipientAmount: 0 },
    {}
  );
  assert.strictEqual(repayment.payoutSettlementStatus, "NOT_APPLICABLE");

  const publicRow = toPublicPayoutBreakdown({
    state: "PAID",
    provider: "PAYSTACK",
    amount: 50,
    commissionAmount: 3.5,
    recipientAmount: 46.5,
    processorFeeAmount: 2.82,
    expectedBankSettlementAmount: 43.68,
    payoutSettlementStatus: "PENDING",
    merchantReference: "EF-X",
  });
  assert.strictEqual(publicRow.customerAmount, 50);
  assert.strictEqual(publicRow.commissionAmount, 3.5);
  assert.strictEqual(publicRow.recipientGrossShare, 46.5);
  assert.strictEqual(publicRow.processorFeeAmount, 2.82);
  assert.strictEqual(publicRow.expectedBankSettlementAmount, 43.68);
  assert.strictEqual(publicRow.payoutSettlementStatus, "PENDING");

  assert.strictEqual(mapPaystackSettlementApiStatus("processing"), "PROCESSING");
  assert.strictEqual(mapPaystackSettlementApiStatus("success"), "SETTLED");
  assert.strictEqual(mapPaystackSettlementApiStatus("pending"), "PENDING");
  assert.strictEqual(mapPaystackSettlementApiStatus("paid"), null);
  assert.strictEqual(mapPaystackSettlementApiStatus("success"), "SETTLED");
  assert.notStrictEqual(mapPaystackSettlementApiStatus("success"), mapPaystackSettlementApiStatus("paid"));

  assert.strictEqual(
    shouldRepairFalseChargeTimeProcessing({
      provider: "PAYSTACK",
      state: "PAID",
      kind: "LABOR",
      payoutSettlementStatus: "PROCESSING",
      payoutSettlementId: null,
    }),
    true
  );
  assert.strictEqual(
    shouldRepairFalseChargeTimeProcessing({
      provider: "PAYSTACK",
      state: "PAID",
      kind: "LABOR",
      payoutSettlementStatus: "PROCESSING",
      payoutSettlementId: "gps_real",
    }),
    false
  );
  assert.strictEqual(
    shouldRepairFalseChargeTimeProcessing({
      provider: "PAYSTACK",
      state: "PAID",
      kind: "LABOR",
      payoutSettlementStatus: "SETTLED",
      payoutSettlementId: null,
    }),
    false
  );

  const existingWins = resolveAuthoritativeProcessorFee({
    intent: { processorFeeAmount: 2.82, provider: "PAYSTACK", kind: "LABOR" },
    evidence: { fees: 999 },
  });
  assert.strictEqual(Number(existingWins), 2.82);

  const settlementFeesOnly = feeFromSettlementTransaction(
    { fees: 282, fees_split: null },
    { provider: "PAYSTACK", kind: "LABOR" }
  );
  assert.strictEqual(Number(settlementFeesOnly), 2.82);

  const settlementMainAccount = feeFromSettlementTransaction(
    { fees: 282, bearer: "account" },
    { provider: "PAYSTACK", kind: "LABOR" }
  );
  assert.strictEqual(settlementMainAccount, null);

  console.log("payoutTransparency.test.js: all passed");
}

run();
