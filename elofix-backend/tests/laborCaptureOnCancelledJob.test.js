/**
 * A labor capture that lands after the customer cancelled must be refunded,
 * and must not be treated as an already-paid or forfeited job.
 * Run: node tests/laborCaptureOnCancelledJob.test.js
 */
const assert = require("assert");
const {
  unpaidCancelledLaborJob,
  capturedRefundRetrySucceeded,
} = require("../src/services/payments/laborCaptureOnCancelledJob");

function testUnpaidCancelledJobRejectsCapture() {
  assert.strictEqual(
    unpaidCancelledLaborJob(
      { status: "CANCELLED", laborPaid: false },
      { statusOverride: "CANCELLED", laborPaid: false }
    ),
    true
  );
  assert.strictEqual(
    unpaidCancelledLaborJob({ status: "IN_PROGRESS", laborPaid: false }, { statusOverride: "CANCELLED" }),
    true
  );
  assert.strictEqual(
    unpaidCancelledLaborJob({ status: "CANCELLED", laborPaid: false }, [{ laborPaid: false }, { statusOverride: "IN_PROGRESS" }]),
    true
  );
}

function testOpenJobStillAcceptsCapture() {
  assert.strictEqual(
    unpaidCancelledLaborJob(
      { status: "ACCEPTED", laborPaid: false },
      { statusOverride: "ASSIGNED", laborPaid: false }
    ),
    false
  );
  assert.strictEqual(
    unpaidCancelledLaborJob({ status: "IN_PROGRESS", laborPaid: false }, { statusOverride: "IN_PROGRESS" }),
    false
  );
  assert.strictEqual(unpaidCancelledLaborJob(null, { statusOverride: "CANCELLED" }), false);
}

function testAlreadyPaidOrForfeitedCancelIsNotAnUnappliedCapture() {
  assert.strictEqual(
    unpaidCancelledLaborJob(
      { status: "CANCELLED", laborPaid: true },
      { statusOverride: "CANCELLED", laborPaid: true }
    ),
    false
  );
  assert.strictEqual(
    unpaidCancelledLaborJob(
      { status: "CANCELLED", laborPaid: false },
      { statusOverride: "CANCELLED", laborPaid: true }
    ),
    false
  );
  assert.strictEqual(
    unpaidCancelledLaborJob({ status: "CANCELLED", laborPaid: true }, { statusOverride: "CANCELLED", laborPaid: false }),
    false
  );
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
  testUnpaidCancelledJobRejectsCapture();
  testOpenJobStillAcceptsCapture();
  testAlreadyPaidOrForfeitedCancelIsNotAnUnappliedCapture();
  testRefundRetryTreatsTerminalGatewayResultsAsDone();
  console.log("laborCaptureOnCancelledJob.test.js passed");
}

main();
