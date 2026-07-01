/**
 * Courier delivery cancel refund — 7% commission retained by platform.
 * Run: node tests/courierCancelRefund.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const {
  netCourierCancelRefundFromGross,
  computeCancelRefundAmount,
} = require("../src/services/payment.service");

function testNetCourierCancelRefundFromGross() {
  assert.strictEqual(netCourierCancelRefundFromGross(600), 558);
  assert.strictEqual(netCourierCancelRefundFromGross(100), 93);
}

function testCourierPreReleaseFullGross() {
  const job = {
    laborPaid: true,
    totalPrice: 600,
    providerAmount: 558,
    commissionAmount: 42,
    releasedAmount: 0,
    price: 600,
  };
  assert.strictEqual(computeCancelRefundAmount(job, { courierFlow: true }), 558);
}

function testCourierPartialEscrowNoDoubleDeduct() {
  const job = {
    laborPaid: true,
    totalPrice: 600,
    providerAmount: 558,
    commissionAmount: 42,
    releasedAmount: 279,
    price: 600,
  };
  // Remaining provider escrow = 558 - 279 = 279 (already net of commission).
  assert.strictEqual(computeCancelRefundAmount(job, { courierFlow: true }), 279);
}

function testNonCourierPreReleaseFullGross() {
  const job = {
    laborPaid: true,
    totalPrice: 600,
    providerAmount: 558,
    commissionAmount: 42,
    releasedAmount: 0,
    price: 600,
  };
  assert.strictEqual(computeCancelRefundAmount(job, { courierFlow: false }), 600);
  assert.strictEqual(computeCancelRefundAmount(job), 600);
}

function testCourierLegacyNonEscrow() {
  const job = {
    laborPaid: true,
    price: 600,
  };
  assert.strictEqual(computeCancelRefundAmount(job, { courierFlow: true }), 558);
}

function testUnpaidJob() {
  const job = { laborPaid: false, totalPrice: 600, providerAmount: 558, releasedAmount: 0 };
  assert.strictEqual(computeCancelRefundAmount(job, { courierFlow: true }), 0);
}

testNetCourierCancelRefundFromGross();
testCourierPreReleaseFullGross();
testCourierPartialEscrowNoDoubleDeduct();
testNonCourierPreReleaseFullGross();
testCourierLegacyNonEscrow();
testUnpaidJob();

console.log("courierCancelRefund.test.js: all passed");
