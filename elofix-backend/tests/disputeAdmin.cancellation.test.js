/**
 * Cancellation dispute helpers.
 * Run: node tests/disputeAdmin.cancellation.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const { isCancellationDispute } = require("../src/services/disputeAdmin.service");

function testIsCancellationDispute() {
  assert.strictEqual(isCancellationDispute({ cancellationSource: "customer_cancel" }), true);
  assert.strictEqual(isCancellationDispute({ cancellationSource: "provider_cancel" }), true);
  assert.strictEqual(isCancellationDispute({ cancellationSource: "customer_changed_provider" }), false);
  assert.strictEqual(isCancellationDispute({}), false);
  assert.strictEqual(isCancellationDispute(null), false);
}

testIsCancellationDispute();
console.log("disputeAdmin.cancellation.test.js: all passed");
