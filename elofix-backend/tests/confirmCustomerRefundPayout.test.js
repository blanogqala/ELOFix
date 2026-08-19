/**
 * Confirm-repayment payout summary (no DB).
 * Run: node tests/confirmCustomerRefundPayout.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const {
  summarizeCustomerRefundPayoutResults,
} = require("../src/services/refundRecovery.service");

function run() {
  assert.strictEqual(
    summarizeCustomerRefundPayoutResults([{ status: "REFUND_COMPLETED" }]),
    "REFUND_COMPLETED"
  );
  assert.strictEqual(
    summarizeCustomerRefundPayoutResults([
      { status: "REFUND_COMPLETED" },
      { status: "REFUND_FAILED" },
    ]),
    "REFUND_FAILED"
  );
  assert.strictEqual(
    summarizeCustomerRefundPayoutResults([{ status: "REFUND_MANUAL_ACTION_REQUIRED" }]),
    "REFUND_MANUAL_ACTION_REQUIRED"
  );
  assert.strictEqual(summarizeCustomerRefundPayoutResults([]), "NONE");
  console.log("confirmCustomerRefundPayout.test.js: all passed (4/4)");
}

run();
