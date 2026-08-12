/**
 * Cancellation refund amounts use settled paid tranches, not full quote.
 * Run: node tests/cancellationPaidTranche.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const {
  paidLaborGrossFromJob,
  remainingRefundableLaborGross,
  disputeGrossToLaborNet,
} = require("../src/utils/refundMath.util");
const { computeCancelRefundAmount } = require("../src/services/payment.service");

const depositMeta = {
  laborPaid: true,
  depositPayment: { status: "paid", amount: 500, commissionAmount: 35, recipientAmount: 465 },
};

const depositOnlyJob = {
  laborPaid: true,
  legacyEscrowV2: false,
  totalPrice: 1000,
  quotedAmount: 1000,
  price: 1000,
  providerAmount: 465,
  commissionAmount: 35,
  releasedAmount: 465,
  paymentModeSnapshot: "TWO_PAYMENT_50_50",
  firstPaymentAmount: 500,
  secondPaymentAmount: 500,
  paymentProgress: "FIRST_PAID",
};

function testPaidLaborGrossDepositOnly() {
  assert.strictEqual(paidLaborGrossFromJob(depositOnlyJob, depositMeta), 500);
}

function testPaidLaborGrossFullyPaid() {
  const meta = {
    ...depositMeta,
    completionPayment: { status: "paid", amount: 500, commissionAmount: 35, recipientAmount: 465 },
  };
  const job = {
    ...depositOnlyJob,
    providerAmount: 930,
    commissionAmount: 70,
    releasedAmount: 930,
    paymentProgress: "FULLY_PAID",
  };
  assert.strictEqual(paidLaborGrossFromJob(job, meta), 1000);
}

function testRemainingRefundableAfterPriorRefund() {
  const meta = {
    ...depositMeta,
    refund: { cumulativeCustomerNet: 465, amount: 465 },
  };
  assert.strictEqual(remainingRefundableLaborGross(depositOnlyJob, meta), 0);
}

function testRemainingRefundableAfterLegacyGrossRefund() {
  const meta = {
    ...depositMeta,
    refund: { cumulativeCustomerNet: 500, amount: 500 },
  };
  assert.strictEqual(remainingRefundableLaborGross(depositOnlyJob, meta), 0);
}

function testComputeCancelRefundUsesPaidNotQuote() {
  const job = {
    ...depositOnlyJob,
    releasedAmount: 0,
    providerAmount: 465,
  };
  assert.strictEqual(computeCancelRefundAmount(job, { meta: depositMeta }), 500);
  assert.notStrictEqual(computeCancelRefundAmount(job, { meta: depositMeta }), 1000);
}

function testDisputeFullRefundUsesPaidNetAfterCommission() {
  assert.strictEqual(
    disputeGrossToLaborNet("FULL_REFUND", 0, depositOnlyJob, depositMeta),
    465
  );
}

function testDisputeFullRefundCourierKeepsCommission() {
  const courierMeta = { courierFlow: true, laborPaid: true, servicePayment: { status: "paid", amount: 600 } };
  const courierJob = {
    laborPaid: true,
    totalPrice: 600,
    price: 600,
    legacyEscrowV2: true,
  };
  assert.strictEqual(disputeGrossToLaborNet("FULL_REFUND", 0, courierJob, courierMeta), 558);
}

testPaidLaborGrossDepositOnly();
testPaidLaborGrossFullyPaid();
testRemainingRefundableAfterPriorRefund();
testRemainingRefundableAfterLegacyGrossRefund();
testComputeCancelRefundUsesPaidNotQuote();
testDisputeFullRefundUsesPaidNetAfterCommission();
testDisputeFullRefundCourierKeepsCommission();

console.log("cancellationPaidTranche.test.js: all passed");
