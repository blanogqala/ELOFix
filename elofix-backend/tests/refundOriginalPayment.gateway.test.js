/**
 * Gateway-agnostic refundOriginalPayment + PayFast manual path + amount authority.
 * Run: node tests/refundOriginalPayment.gateway.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const {
  normalizeGatewayRefundResult,
  remainingRefundableOnIntent,
} = require("../src/services/payments/refund.service");
const { classifyGatewayRefundResult } = require("../src/utils/refundMath.util");
const payfast = require("../src/services/payments/payfast.gateway");

async function testPayfastRefundIsManual() {
  const result = await payfast.refund();
  assert.strictEqual(result.supported, false);
  assert.strictEqual(result.requiresManualAction, true);
  const normalized = normalizeGatewayRefundResult(result);
  assert.strictEqual(normalized.requiresManualAction, true);
  assert.strictEqual(normalized.status, "MANUAL_REQUIRED");
  const classified = classifyGatewayRefundResult(normalized);
  assert.strictEqual(classified.manualOnly, true);
  assert.strictEqual(classified.failed, false);
}

function testRemainingRefundable() {
  assert.strictEqual(
    remainingRefundableOnIntent({ amount: 500, refundedAmount: 0 }),
    500
  );
  assert.strictEqual(
    remainingRefundableOnIntent({ amount: 500, refundedAmount: 200 }),
    300
  );
  assert.strictEqual(
    remainingRefundableOnIntent({ amount: 500, refundedAmount: 500 }),
    0
  );
}

function testNormalizeUnsupported() {
  const n = normalizeGatewayRefundResult({
    supported: false,
    message: "refund_not_supported",
  });
  assert.strictEqual(n.ok, false);
  assert.strictEqual(n.requiresManualAction, true);
}

async function main() {
  await testPayfastRefundIsManual();
  testRemainingRefundable();
  testNormalizeUnsupported();
  console.log("refundOriginalPayment.gateway.test.js: all passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
