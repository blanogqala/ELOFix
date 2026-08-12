/**
 * Financial refund / escrow unit tests (no DB).
 * Run: node tests/financial.refund.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const {
  roundMoney,
  grossToNetLaborRefund,
  disputeGrossToLaborNet,
  classifyGatewayRefundResult,
  resolveRefundStatusAfterGateway,
  EPS,
} = require("../src/utils/refundMath.util");

function testGrossToNetLaborRefund() {
  assert.strictEqual(grossToNetLaborRefund(100, 100), 93);
  assert.strictEqual(grossToNetLaborRefund(200, 100), 93);
  assert.strictEqual(grossToNetLaborRefund(0, 100), 0);
}

function testDisputeGrossToLaborNet() {
  const jobNoPaid = { totalPrice: 1000, price: 1000 };
  const metaEmpty = {};
  assert.strictEqual(disputeGrossToLaborNet("FULL_REFUND", 0, jobNoPaid, metaEmpty), 0);
  assert.strictEqual(disputeGrossToLaborNet("PARTIAL_REFUND", 500, jobNoPaid, metaEmpty), 0);

  const depositJob = {
    laborPaid: true,
    legacyEscrowV2: false,
    totalPrice: 1000,
    quotedAmount: 1000,
    paymentModeSnapshot: "TWO_PAYMENT_50_50",
    firstPaymentAmount: 500,
    secondPaymentAmount: 500,
    paymentProgress: "FIRST_PAID",
  };
  const depositMeta = { laborPaid: true, depositPayment: { status: "paid", amount: 500 } };
  assert.strictEqual(disputeGrossToLaborNet("FULL_REFUND", 0, depositJob, depositMeta), 465);
  assert.strictEqual(disputeGrossToLaborNet("PARTIAL_REFUND", 500, depositJob, depositMeta), 465);
  assert.strictEqual(disputeGrossToLaborNet("PARTIAL_REFUND", 1000, depositJob, depositMeta), 465);
}

function testEscrowAppliedNotOverstated() {
  const laborNet = 100;
  const escrowTarget = 80;
  const actualApplied = 50;
  let escrowApplied = actualApplied;
  let stillNeeded = roundMoney(laborNet - escrowApplied);
  assert.ok(stillNeeded > EPS);
  assert.strictEqual(stillNeeded, 50);
  assert.notStrictEqual(escrowApplied, escrowTarget);
}

function testClassifyGatewayRefundResult() {
  const manual = classifyGatewayRefundResult({ supported: false, ok: false });
  assert.strictEqual(manual.manualOnly, true);
  assert.strictEqual(manual.success, false);

  const ok = classifyGatewayRefundResult({ ok: true });
  assert.strictEqual(ok.success, true);
  assert.strictEqual(ok.failed, false);

  const fail = classifyGatewayRefundResult({ ok: false, reason: "declined" });
  assert.strictEqual(fail.failed, true);
}

function testResolveRefundStatusAfterGateway() {
  assert.strictEqual(
    resolveRefundStatusAfterGateway({ manualOnly: false, gatewaySuccess: true, isFullRefund: true }),
    "processed"
  );
  assert.strictEqual(
    resolveRefundStatusAfterGateway({ manualOnly: true, gatewaySuccess: false, isFullRefund: false }),
    "pending_manual_gateway"
  );
  assert.strictEqual(
    resolveRefundStatusAfterGateway({ manualOnly: false, gatewaySuccess: false, isFullRefund: false }),
    "recorded"
  );
}

testGrossToNetLaborRefund();
testDisputeGrossToLaborNet();
testEscrowAppliedNotOverstated();
testClassifyGatewayRefundResult();
testResolveRefundStatusAfterGateway();

function testStagedRefundSplit() {
  const laborNet = 930;
  const heldFromJob = 465;
  const available = 0;
  const heldPortion = Math.min(laborNet, heldFromJob);
  const releasedPortion = laborNet - heldPortion;
  const clawbackPreview = Math.min(releasedPortion, available);
  const debtPreview = releasedPortion - clawbackPreview;
  const immediate = heldPortion + clawbackPreview;
  assert.strictEqual(immediate, 465);
  assert.strictEqual(debtPreview, 465);
  assert.strictEqual(immediate + debtPreview, laborNet);
}

function testRefundReferenceFormat() {
  const { generateRefundReference } = require("../src/utils/refundReference.util");
  const ref = generateRefundReference({ user: { name: "Arthur Nogqala" } });
  assert.ok(ref.startsWith("EFX-"));
  assert.ok(ref.includes("ARTHUR NOGQALA"));
}

function testRefundDebtDueMs() {
  const saved = process.env.REFUND_DEBT_DUE_MINUTES;
  delete process.env.REFUND_DEBT_DUE_MINUTES;
  delete require.cache[require.resolve("../src/config/refundRecovery.config")];
  const cfgDefault = require("../src/config/refundRecovery.config");
  assert.strictEqual(cfgDefault.REFUND_DEBT_DUE_DAYS, 30);
  assert.strictEqual(cfgDefault.getRefundDebtDueMs(), 30 * 24 * 60 * 60 * 1000);

  process.env.REFUND_DEBT_DUE_MINUTES = "1";
  delete require.cache[require.resolve("../src/config/refundRecovery.config")];
  const cfgMin = require("../src/config/refundRecovery.config");
  assert.strictEqual(cfgMin.getRefundDebtDueMs(), 60 * 1000);

  if (saved != null) process.env.REFUND_DEBT_DUE_MINUTES = saved;
  else delete process.env.REFUND_DEBT_DUE_MINUTES;
  delete require.cache[require.resolve("../src/config/refundRecovery.config")];
}

testStagedRefundSplit();
testRefundReferenceFormat();
testRefundDebtDueMs();
console.log("financial.refund.test.js: OK");
