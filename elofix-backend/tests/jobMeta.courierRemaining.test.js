/**
 * Courier/delivery/moving earnings remaining must show held provider share (93%)
 * until release — not forced to 0 while pre-confirmation.
 *
 * Run: node tests/jobMeta.courierRemaining.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");

const {
  computeProviderEntitledRemaining,
  enrichJob,
} = require("../src/services/jobMeta.service");

function testPaidCourierShowsFullRemaining() {
  const providerAmount = 279; // 93% of R 300
  const job = {
    providerAmount,
    releasedAmount: 0,
    totalPrice: 300,
    laborPaid: true,
    paymentReleased: false,
    isFullyReleased: false,
    status: "IN_PROGRESS",
  };
  const meta = {
    courierFlow: true,
    completionConfirmedByUser: false,
    escrow: { heldAmount: providerAmount, releasedAmount: 0 },
  };

  assert.strictEqual(
    computeProviderEntitledRemaining(job, meta),
    providerAmount,
    "paid courier hold should remain as providerAmount"
  );

  const enriched = enrichJob(job, meta);
  assert.strictEqual(enriched.remainingAmount, providerAmount);
}

function testCourierRemainingZeroAfterRelease() {
  const providerAmount = 279;
  const job = {
    providerAmount,
    releasedAmount: providerAmount,
    totalPrice: 300,
    laborPaid: true,
    paymentReleased: true,
    isFullyReleased: true,
    status: "COMPLETED",
  };
  const meta = {
    courierFlow: true,
    completionConfirmedByUser: true,
    escrow: { heldAmount: 0, releasedAmount: providerAmount },
  };

  assert.strictEqual(computeProviderEntitledRemaining(job, meta), 0);
  assert.strictEqual(enrichJob(job, meta).remainingAmount, 0);
}

function testMovingCategorySameAsCourier() {
  const providerAmount = 465;
  const job = {
    providerAmount,
    releasedAmount: 0,
    totalPrice: 500,
    laborPaid: true,
    paymentReleased: false,
    isFullyReleased: false,
    status: "ACCEPTED",
  };
  const meta = {
    courierFlow: true,
    completionConfirmedByUser: false,
    escrow: { heldAmount: providerAmount, releasedAmount: 0 },
  };

  assert.strictEqual(computeProviderEntitledRemaining(job, meta), providerAmount);
}

function testUnpaidCourierRemainingZero() {
  const job = {
    providerAmount: null,
    releasedAmount: 0,
    totalPrice: 0,
    laborPaid: false,
    paymentReleased: false,
    isFullyReleased: false,
    status: "PENDING",
  };
  const meta = {
    courierFlow: true,
    completionConfirmedByUser: false,
    escrow: { heldAmount: 0, releasedAmount: 0 },
  };

  assert.strictEqual(computeProviderEntitledRemaining(job, meta), 0);
}

function run() {
  testPaidCourierShowsFullRemaining();
  testCourierRemainingZeroAfterRelease();
  testMovingCategorySameAsCourier();
  testUnpaidCourierRemainingZero();
  console.log("jobMeta.courierRemaining.test.js: all tests passed");
}

run();
