/**
 * Courier cancellation must not throw away a captured delivery-fee charge.
 * Run: node tests/deliveryFeeRefundPreserve.test.js
 */
const assert = require("assert");
const {
  shouldPreserveCapturedDeliveryFee,
  planDeliveryFeeIntentRelease,
  supplementalRefundKind,
} = require("../src/services/payments/deliveryFeeRefundPreserve");

const now = new Date("2026-11-19T11:00:00.000Z");

function testDisputeKeepsCapturedChargeRefundable() {
  const intent = {
    id: "fee-1",
    state: "PAID",
    jobId: null,
    gatewayTransactionId: "pstk_tx_100",
    merchantReference: "EF-OLD",
    gatewayPayload: { deliveryRequestId: "dr-1" },
  };
  assert.strictEqual(shouldPreserveCapturedDeliveryFee(intent, true), true);
  const [action] = planDeliveryFeeIntentRelease([intent], {
    preserveCaptured: true,
    jobId: "courier-job",
    materialOrderId: "order-1",
    now,
  });
  assert.strictEqual(action.type, "detach");
  assert.strictEqual(action.data.materialOrderId, null);
  assert.strictEqual(action.data.jobId, "courier-job");
  assert.strictEqual(action.data.gatewayPayload.deliveryRequestId, "dr-1");
  assert.strictEqual(action.data.gatewayPayload.detachedMaterialOrderId, "order-1");
  assert.strictEqual(action.data.gatewayPayload.detachedForRefundReview, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(action.data, "state"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(action.data, "gatewayTransactionId"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(action.data, "merchantReference"), false);
}

function testForfeitStillCancels() {
  const intent = {
    id: "fee-2",
    state: "PAID",
    jobId: "courier-job",
    gatewayTransactionId: "pstk_tx_100",
  };
  assert.strictEqual(shouldPreserveCapturedDeliveryFee(intent, false), false);
  const [action] = planDeliveryFeeIntentRelease([intent], {
    preserveCaptured: false,
    materialOrderId: "order-1",
    now,
  });
  assert.strictEqual(action.type, "cancel");
  assert.strictEqual(action.data.state, "CANCELLED");
}

function testInFlightCaptureStaysAttachedToGateway() {
  const intent = {
    id: "fee-pending",
    state: "PROCESSING",
    jobId: "courier-job",
    gatewayTransactionId: "pstk_tx_open",
  };
  assert.strictEqual(shouldPreserveCapturedDeliveryFee(intent, true), true);
  const [action] = planDeliveryFeeIntentRelease([intent], {
    preserveCaptured: true,
    materialOrderId: "order-1",
    now,
  });
  assert.strictEqual(action.type, "detach");
  assert.strictEqual(action.data.jobId, "courier-job");
}

function testSandboxPaidWithoutGatewayStillCancels() {
  const intent = { id: "fee-3", state: "PAID", gatewayTransactionId: null };
  assert.strictEqual(shouldPreserveCapturedDeliveryFee(intent, true), false);
  const [action] = planDeliveryFeeIntentRelease([intent], {
    preserveCaptured: true,
    materialOrderId: "order-1",
    now,
  });
  assert.strictEqual(action.type, "cancel");
}

function testAlreadyRefundedDetachesWithoutReopening() {
  const intent = { id: "fee-4", state: "REFUNDED", jobId: "courier-job", gatewayTransactionId: "pstk_tx_9" };
  const [action] = planDeliveryFeeIntentRelease([intent], {
    preserveCaptured: true,
    materialOrderId: "order-1",
    now,
  });
  assert.strictEqual(action.type, "detach");
  assert.strictEqual(action.data.jobId, "courier-job");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(action.data, "state"), false);
}

function testRefundLookupUsesDeliveryFeeOnlyWhenLaborIsMissing() {
  assert.strictEqual(supplementalRefundKind(1), null);
  assert.strictEqual(supplementalRefundKind(2), null);
  assert.strictEqual(supplementalRefundKind(0), "DELIVERY_FEE");
}

testDisputeKeepsCapturedChargeRefundable();
testForfeitStillCancels();
testInFlightCaptureStaysAttachedToGateway();
testSandboxPaidWithoutGatewayStillCancels();
testAlreadyRefundedDetachesWithoutReopening();
testRefundLookupUsesDeliveryFeeOnlyWhenLaborIsMissing();
console.log("deliveryFeeRefundPreserve.test.js passed");
