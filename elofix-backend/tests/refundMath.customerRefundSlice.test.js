/**
 * Staged/customer refund slice must not mark REFUND_COMPLETED while pending remains.
 * Run: node tests/refundMath.customerRefundSlice.test.js
 */
const assert = require("assert");
const { applyCustomerRefundSliceToMeta } = require("../src/utils/refundMath.util");

function testPartialSliceKeepsProcessing() {
  const now = "2026-09-18T11:00:00.000Z";
  const { businessComplete, newPending, refund } = applyCustomerRefundSliceToMeta(
    {
      pendingRefund: 186,
      immediateRefund: 0,
      customerRefundStatus: "REFUND_PROCESSING",
      status: "processing",
    },
    93,
    now
  );
  assert.strictEqual(businessComplete, false);
  assert.strictEqual(newPending, 93);
  assert.strictEqual(refund.pendingRefund, 93);
  assert.strictEqual(refund.immediateRefund, 93);
  assert.strictEqual(refund.customerRefundStatus, "REFUND_PROCESSING");
  assert.strictEqual(refund.status, "partial");
  assert.strictEqual(refund.completedAt, null);
}

function testFinalSliceMarksCompleted() {
  const now = "2026-09-18T11:00:00.000Z";
  const { businessComplete, newPending, refund } = applyCustomerRefundSliceToMeta(
    {
      pendingRefund: 93,
      immediateRefund: 93,
      customerRefundStatus: "REFUND_PROCESSING",
      status: "partial",
      completedAt: null,
    },
    93,
    now
  );
  assert.strictEqual(businessComplete, true);
  assert.strictEqual(newPending, 0);
  assert.strictEqual(refund.pendingRefund, 0);
  assert.strictEqual(refund.immediateRefund, 186);
  assert.strictEqual(refund.customerRefundStatus, "REFUND_COMPLETED");
  assert.strictEqual(refund.status, "processed");
  assert.strictEqual(refund.completedAt, now);
}

function testFinalSlicePreservesExistingCompletedAt() {
  const existing = "2026-09-01T00:00:00.000Z";
  const { refund } = applyCustomerRefundSliceToMeta(
    {
      pendingRefund: 10,
      immediateRefund: 80,
      completedAt: existing,
    },
    10,
    "2026-09-18T11:00:00.000Z"
  );
  assert.strictEqual(refund.customerRefundStatus, "REFUND_COMPLETED");
  assert.strictEqual(refund.completedAt, existing);
}

function main() {
  testPartialSliceKeepsProcessing();
  testFinalSliceMarksCompleted();
  testFinalSlicePreservesExistingCompletedAt();
  console.log("refundMath.customerRefundSlice.test.js: all passed");
}

main();
