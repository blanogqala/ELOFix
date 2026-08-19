/**
 * Soft-delete (hide from list) is blocked while a refund is unsettled.
 * Run: node tests/jobDeletePolicy.util.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const AppError = require("../src/utils/AppError");
const {
  isRefundUnsettled,
  assertRefundSettledForDelete,
  REFUND_BLOCKS_DELETE_MSG,
} = require("../src/utils/jobDeletePolicy.util");

function testPendingRefundBlocks() {
  assert.strictEqual(
    isRefundUnsettled({ refund: { pendingRefund: 232.5, customerRefundStatus: "READY" } }),
    true
  );
}

function testInFlightStatusBlocks() {
  assert.strictEqual(isRefundUnsettled({ refund: { customerRefundStatus: "REFUND_PROCESSING" } }), true);
  assert.strictEqual(isRefundUnsettled({ refund: { customerRefundStatus: "REFUND_FAILED" } }), true);
}

function testProviderDebtBlocks() {
  assert.strictEqual(
    isRefundUnsettled({ refund: { pendingRefund: 0, providerDebtAdded: 232.5 } }),
    true
  );
}

function testCompletedAllows() {
  assert.strictEqual(
    isRefundUnsettled({
      refund: {
        pendingRefund: 0,
        providerDebtAdded: 0,
        customerRefundStatus: "REFUND_COMPLETED",
      },
    }),
    false
  );
}

function testNoRefundAllows() {
  assert.strictEqual(isRefundUnsettled({}), false);
  assert.strictEqual(isRefundUnsettled({ refund: {} }), false);
}

function testAssertThrowsOnPending() {
  let threw = false;
  try {
    assertRefundSettledForDelete({ refund: { pendingRefund: 10 } });
  } catch (e) {
    threw = true;
    assert.ok(e instanceof AppError);
    assert.strictEqual(e.statusCode, 400);
    assert.strictEqual(e.message, REFUND_BLOCKS_DELETE_MSG);
  }
  assert.strictEqual(threw, true);
}

function testAssertAllowsSettled() {
  assertRefundSettledForDelete({ refund: { customerRefundStatus: "REFUND_COMPLETED" } });
}

function run() {
  testPendingRefundBlocks();
  testInFlightStatusBlocks();
  testProviderDebtBlocks();
  testCompletedAllows();
  testNoRefundAllows();
  testAssertThrowsOnPending();
  testAssertAllowsSettled();
  console.log("jobDeletePolicy.util.test.js: all passed (7/7)");
}

run();
