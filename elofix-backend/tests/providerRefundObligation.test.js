/**
 * Provider refund obligation DTO + derived status.
 * Run: node tests/providerRefundObligation.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const {
  deriveRepaymentStatus,
} = require("../src/services/refundRecovery.service");

function testDeriveRepaymentStatus() {
  assert.strictEqual(
    deriveRepaymentStatus({
      recoveryStatus: "PENDING",
      balance: 100,
      pendingRepayment: null,
      lastRejectedRepayment: null,
    }),
    "REFUND_DUE"
  );
  assert.strictEqual(
    deriveRepaymentStatus({
      recoveryStatus: "OVERDUE",
      balance: 50,
      pendingRepayment: null,
    }),
    "OVERDUE"
  );
  assert.strictEqual(
    deriveRepaymentStatus({
      recoveryStatus: "PENDING",
      balance: 50,
      pendingRepayment: { id: "x" },
    }),
    "AWAITING_VERIFICATION"
  );
  assert.strictEqual(
    deriveRepaymentStatus({
      recoveryStatus: "PENDING",
      balance: 50,
      pendingRepayment: null,
      lastRejectedRepayment: { amount: 50 },
    }),
    "PAYMENT_REJECTED"
  );
  assert.strictEqual(
    deriveRepaymentStatus({
      recoveryStatus: "RECOVERED",
      balance: 0,
      pendingRepayment: null,
      customerRefundPending: 40,
    }),
    "REFUND_PROCESSING"
  );
  assert.strictEqual(
    deriveRepaymentStatus({
      recoveryStatus: "RECOVERED",
      balance: 0,
      pendingRepayment: null,
      customerRefundPending: 0,
    }),
    "REFUNDED"
  );
}

testDeriveRepaymentStatus();
console.log("providerRefundObligation.test.js: all passed");
