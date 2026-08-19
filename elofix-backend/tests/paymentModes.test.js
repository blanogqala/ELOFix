/**
 * Unit tests for immediate-settlement payment modes + commission math (cents-safe).
 * Run: node tests/paymentModes.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { splitCommission, splitFiftyFiftySchedule, toCents, fromCents } = require("../src/services/payments/money.util");
const paymentModeService = require("../src/services/payments/paymentMode.service");

function approxEqual(a, b, eps = 0.001) {
  assert.ok(Math.abs(Number(a) - Number(b)) <= eps, `expected ${a} ≈ ${b}`);
}

// --- TEST CASE 1: R10,000 TWO_PAYMENT_50_50 ---
{
  const schedule = paymentModeService.computePaymentSchedule("TWO_PAYMENT_50_50", 10000);
  approxEqual(Number(schedule.quotedAmount), 10000);
  approxEqual(Number(schedule.firstPaymentAmount), 5000);
  approxEqual(Number(schedule.secondPaymentAmount), 5000);

  const p1 = splitCommission(5000);
  approxEqual(Number(p1.commissionAmount), 350);
  approxEqual(Number(p1.recipientAmount), 4650);

  const p2 = splitCommission(5000);
  approxEqual(Number(p2.commissionAmount), 350);
  approxEqual(Number(p2.recipientAmount), 4650);

  approxEqual(Number(p1.commissionAmount) + Number(p2.commissionAmount), 700);
  approxEqual(Number(p1.recipientAmount) + Number(p2.recipientAmount), 9300);
  // Must NOT charge 7% on full R10,000 twice
  assert.notStrictEqual(Number(p1.commissionAmount), 700);
}

// --- TEST CASE 2: R2,000 SINGLE_PAYMENT_UPFRONT ---
{
  const schedule = paymentModeService.computePaymentSchedule("SINGLE_PAYMENT_UPFRONT", 2000);
  approxEqual(Number(schedule.firstPaymentAmount), 2000);
  assert.strictEqual(schedule.secondPaymentAmount, null);
  const split = splitCommission(2000);
  approxEqual(Number(split.commissionAmount), 140);
  approxEqual(Number(split.recipientAmount), 1860);
}

// --- TEST CASE 3: R800 SINGLE_PAYMENT_ON_COMPLETION ---
{
  const schedule = paymentModeService.computePaymentSchedule("SINGLE_PAYMENT_ON_COMPLETION", 800);
  approxEqual(Number(schedule.firstPaymentAmount), 800);
  assert.strictEqual(schedule.secondPaymentAmount, null);
  const split = splitCommission(800);
  approxEqual(Number(split.commissionAmount), 56);
  approxEqual(Number(split.recipientAmount), 744);
}

// --- Stage resolution ---
{
  const job5050 = {
    paymentModeSnapshot: "TWO_PAYMENT_50_50",
    paymentProgress: "NONE",
    legacyEscrowV2: false,
    firstPaymentAmount: 5000,
    secondPaymentAmount: 5000,
  };
  assert.strictEqual(paymentModeService.resolveNextLaborPaymentType(job5050, {}), "DEPOSIT");
  assert.strictEqual(
    paymentModeService.resolveNextLaborPaymentType(
      { ...job5050, paymentProgress: "FIRST_PAID" },
      { statusOverride: "AWAITING_CONFIRMATION" }
    ),
    "COMPLETION"
  );
  assert.strictEqual(
    paymentModeService.resolveNextLaborPaymentType(
      { ...job5050, paymentProgress: "FIRST_PAID" },
      { statusOverride: "SERVICE_PAID" }
    ),
    null
  );

  const upfront = {
    paymentModeSnapshot: "SINGLE_PAYMENT_UPFRONT",
    paymentProgress: "NONE",
    legacyEscrowV2: false,
    firstPaymentAmount: 2000,
  };
  assert.strictEqual(paymentModeService.resolveNextLaborPaymentType(upfront, {}), "FULL_UPFRONT");
  assert.strictEqual(
    paymentModeService.resolveNextLaborPaymentType({ ...upfront, paymentProgress: "FULLY_PAID" }, {}),
    null
  );

  const onComplete = {
    paymentModeSnapshot: "SINGLE_PAYMENT_ON_COMPLETION",
    paymentProgress: "NONE",
    legacyEscrowV2: false,
    firstPaymentAmount: 800,
  };
  assert.strictEqual(paymentModeService.resolveNextLaborPaymentType(onComplete, {}), null);
  assert.strictEqual(
    paymentModeService.resolveNextLaborPaymentType(onComplete, {
      statusOverride: "AWAITING_CONFIRMATION",
    }),
    "FULL_COMPLETION"
  );
}

// --- Snapshot isolation: category change must not rewrite existing snapshot ---
{
  const job = {
    paymentModeSnapshot: "TWO_PAYMENT_50_50",
    quotedAmount: 10000,
    firstPaymentAmount: 5000,
    secondPaymentAmount: 5000,
    paymentProgress: "NONE",
  };
  // compute with different mode still uses job snapshot for expected amounts
  const expected = paymentModeService.expectedAmountForLaborPaymentType(job, "DEPOSIT");
  approxEqual(Number(expected), 5000);
}

// --- Amount mismatch ---
{
  let threw = false;
  try {
    paymentModeService.assertAmountMatchesExpected(4999, 5000);
  } catch (e) {
    threw = true;
  }
  assert.strictEqual(threw, true);
  paymentModeService.assertAmountMatchesExpected(5000, 5000);
}

// --- Cents helpers ---
{
  assert.strictEqual(toCents(10.005), 1001); // round
  assert.strictEqual(fromCents(1001), 10.01);
  const odd = splitFiftyFiftySchedule(100.01);
  approxEqual(Number(odd.firstPaymentAmount) + Number(odd.secondPaymentAmount), 100.01);
}

// --- Payment summary: ignore draft job.price until provider submits service price ---
{
  const draftJob = {
    price: 23,
    quotedAmount: null,
    paymentModeSnapshot: null,
    paymentProgress: "NONE",
    legacyEscrowV2: false,
  };
  assert.strictEqual(paymentModeService.buildPaymentSummary(draftJob, {}), null);

  const quotedJob = {
    price: 4500,
    quotedAmount: 4500,
    paymentModeSnapshot: "TWO_PAYMENT_50_50",
    paymentProgress: "NONE",
    legacyEscrowV2: false,
    firstPaymentAmount: 2250,
    secondPaymentAmount: 2250,
  };
  const summary = paymentModeService.buildPaymentSummary(quotedJob, {
    servicePrice: { amount: 4500, submittedAt: new Date().toISOString() },
  });
  assert.ok(summary);
  approxEqual(summary.totalAmount, 4500);
}

console.log("paymentModes.test.js: OK");
