/**
 * Admin remaining escrow must not include cancelled/refunded jobs.
 * Run: node tests/jobFinancials.util.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const { sumJobFinancials } = require("../src/utils/jobFinancials.util");

function testCancelledRefundedDoesNotAddRemaining() {
  const live = {
    status: "IN_PROGRESS",
    laborPaid: true,
    legacyEscrowV2: true,
    providerAmount: 930,
    releasedAmount: 465,
    totalPrice: 1000,
    meta: {
      escrow: { heldAmount: 465, releasedAmount: 465 },
    },
  };
  const cancelled = {
    status: "CANCELLED",
    laborPaid: true,
    legacyEscrowV2: true,
    providerAmount: 744,
    releasedAmount: 372,
    totalPrice: 800,
    meta: {
      escrow: { heldAmount: 372, releasedAmount: 372 },
      refund: {
        status: "processed",
        clawbackApplied: 372,
        customerNet: 372,
        cumulativeCustomerNet: 372,
      },
    },
  };

  const liveOnly = sumJobFinancials([live]);
  const both = sumJobFinancials([live, cancelled]);
  assert.strictEqual(both.remainingInEscrow, liveOnly.remainingInEscrow);
  assert.ok(both.remainingInEscrow > 0, "live job should still have remaining escrow");
}

function run() {
  testCancelledRefundedDoesNotAddRemaining();
  console.log("jobFinancials.util.test.js: all passed (1/1)");
}

run();
