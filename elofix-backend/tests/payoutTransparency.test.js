const { Prisma } = require("@prisma/client");
const assert = require("assert");
const { splitCommission, computeExpectedBankSettlement } = require("../src/services/payments/money.util");
const {
  processorFeeFromPaystackEvidence,
  payoutColumnsForPaidIntent,
  toPublicPayoutBreakdown,
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

  const paystackPaid = payoutColumnsForPaidIntent(
    {
      kind: "LABOR",
      provider: "PAYSTACK",
      recipientAmount: new Prisma.Decimal("93.00"),
    },
    { bearer: "subaccount", fees_split: { paystack: 282 } }
  );
  assert.strictEqual(paystackPaid.payoutSettlementStatus, "PROCESSING");
  assert.strictEqual(Number(paystackPaid.processorFeeAmount), 2.82);
  assert.strictEqual(Number(paystackPaid.expectedBankSettlementAmount), 90.18);

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
    payoutSettlementStatus: "PROCESSING",
    merchantReference: "EF-X",
  });
  assert.strictEqual(publicRow.customerAmount, 50);
  assert.strictEqual(publicRow.commissionAmount, 3.5);
  assert.strictEqual(publicRow.recipientGrossShare, 46.5);
  assert.strictEqual(publicRow.processorFeeAmount, 2.82);
  assert.strictEqual(publicRow.expectedBankSettlementAmount, 43.68);
  assert.strictEqual(publicRow.payoutSettlementStatus, "PROCESSING");

  console.log("payoutTransparency.test.js: all passed");
}

run();
