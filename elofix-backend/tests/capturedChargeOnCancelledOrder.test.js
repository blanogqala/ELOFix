/**
 * A capture that lands after the customer cancelled must be refunded.
 * Run: node tests/capturedChargeOnCancelledOrder.test.js
 */
const assert = require("assert");
const {
  materialOrderAcceptsCapturedPayment,
  jobStorePayErrorDisposition,
  capturedRefundRetrySucceeded,
} = require("../src/services/payments/capturedChargeOnCancelledOrder");

function testCancelledMaterialOrderDoesNotAcceptCapture() {
  assert.strictEqual(
    materialOrderAcceptsCapturedPayment({
      fulfillmentStatus: "CANCELLED",
      paymentStatus: "refunded",
    }),
    false
  );
  assert.strictEqual(
    materialOrderAcceptsCapturedPayment({
      fulfillmentStatus: "CANCELLED",
      paymentStatus: "unpaid",
    }),
    false
  );
  assert.strictEqual(
    materialOrderAcceptsCapturedPayment({
      fulfillmentStatus: "PENDING",
      paymentStatus: "refunded",
    }),
    false
  );
}

function testOpenOrderStillAcceptsCapture() {
  assert.strictEqual(
    materialOrderAcceptsCapturedPayment({
      fulfillmentStatus: "PENDING",
      paymentStatus: "unpaid",
    }),
    true
  );
  assert.strictEqual(
    materialOrderAcceptsCapturedPayment({
      fulfillmentStatus: "PREPARING",
      paymentStatus: "paid",
    }),
    true
  );
  assert.strictEqual(materialOrderAcceptsCapturedPayment(null), true);
}

function testInactiveJobStoreListRefundsInsteadOfSwallowing() {
  const inactive = Object.assign(new Error("This materials list is no longer active for payment."), {
    statusCode: 400,
  });
  assert.strictEqual(jobStorePayErrorDisposition(inactive), "refund_captured_charge");

  const already = Object.assign(new Error("Store order materials are already paid"), { statusCode: 400 });
  assert.strictEqual(jobStorePayErrorDisposition(already), "already_applied");

  const missing = Object.assign(new Error("No pending materials order found for this store."), {
    statusCode: 400,
  });
  assert.strictEqual(jobStorePayErrorDisposition(missing), "throw");

  const server = Object.assign(new Error("This materials list is no longer active for payment."), {
    statusCode: 500,
  });
  assert.strictEqual(jobStorePayErrorDisposition(server), "throw");
}

function testRefundRetryTreatsTerminalGatewayResultsAsDone() {
  assert.strictEqual(capturedRefundRetrySucceeded({ ok: true }), true);
  assert.strictEqual(capturedRefundRetrySucceeded({ pending: true, ok: false }), true);
  assert.strictEqual(capturedRefundRetrySucceeded({ ok: false, message: "no_paid_intent" }), true);
  assert.strictEqual(
    capturedRefundRetrySucceeded({ ok: false, message: "nothing_left_to_refund" }),
    true
  );
  assert.strictEqual(
    capturedRefundRetrySucceeded({ ok: false, message: "paystack_refund_failed" }),
    false
  );
  assert.strictEqual(capturedRefundRetrySucceeded(null), false);
}

function main() {
  testCancelledMaterialOrderDoesNotAcceptCapture();
  testOpenOrderStillAcceptsCapture();
  testInactiveJobStoreListRefundsInsteadOfSwallowing();
  testRefundRetryTreatsTerminalGatewayResultsAsDone();
  console.log("capturedChargeOnCancelledOrder.test.js passed");
}

main();
