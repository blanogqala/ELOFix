/**
 * Paid cancellation policy — dispute review before refund release.
 * Run: node tests/jobCancellationPolicy.util.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");

const prisma = require("../src/config/prisma");
const {
  resolveJobCancellationPolicy,
  isProviderEnRouteToService,
} = require("../src/utils/jobCancellationPolicy.util");

const originalFindFirst = prisma.deliveryRequest.findFirst;

async function testUnpaidLaborNoDispute() {
  const policy = await resolveJobCancellationPolicy(
    { id: "j1", customerId: "c1", providerId: "p1", laborPaid: false, status: "ACCEPTED" },
    {},
    "c1",
    "CUSTOMER"
  );
  assert.strictEqual(policy.opensDisputeReview, false);
  assert.strictEqual(policy.refundAmount, 0);
  assert.strictEqual(policy.refundKind, "none");
}

async function testPaidServiceCustomerOpensDispute() {
  const policy = await resolveJobCancellationPolicy(
    { id: "j2", customerId: "c1", providerId: "p1", laborPaid: true, status: "ACCEPTED" },
    {},
    "c1",
    "CUSTOMER"
  );
  assert.strictEqual(policy.opensDisputeReview, true);
  assert.strictEqual(policy.refundAmount, 0);
  assert.strictEqual(policy.refundKind, "dispute_review_pending");
  assert.strictEqual(policy.customerForfeits, false);
}

async function testPaidServiceProviderOpensDispute() {
  const policy = await resolveJobCancellationPolicy(
    { id: "j3", customerId: "c1", providerId: "p1", laborPaid: true, status: "IN_PROGRESS" },
    {},
    "p1",
    "PROVIDER"
  );
  assert.strictEqual(policy.opensDisputeReview, true);
  assert.strictEqual(policy.refundAmount, 0);
  assert.strictEqual(policy.refundKind, "dispute_review_pending");
  assert.strictEqual(policy.cancelledBy, "provider");
}

async function testCourierPostPickupCustomerBlocked() {
  prisma.deliveryRequest.findFirst = async () => ({
    fulfillmentStatus: "OUT_FOR_DELIVERY",
    status: "paid",
  });
  let threw = false;
  try {
    await resolveJobCancellationPolicy(
      { id: "j4", customerId: "c1", providerId: "p1", laborPaid: true, status: "IN_PROGRESS" },
      { courierFlow: true },
      "c1",
      "CUSTOMER"
    );
  } catch (e) {
    threw = true;
    assert.strictEqual(e.statusCode, 409);
    assert.match(e.message, /cannot be cancelled after items have been collected/i);
  }
  assert.strictEqual(threw, true);
  prisma.deliveryRequest.findFirst = originalFindFirst;
}

async function testCourierCollectingCustomerForfeits() {
  prisma.deliveryRequest.findFirst = async () => ({
    fulfillmentStatus: "COLLECTING",
    status: "paid",
  });
  const policy = await resolveJobCancellationPolicy(
    { id: "j4b", customerId: "c1", providerId: "p1", laborPaid: true, status: "IN_PROGRESS" },
    { courierFlow: true },
    "c1",
    "CUSTOMER"
  );
  assert.strictEqual(policy.opensDisputeReview, false);
  assert.strictEqual(policy.customerForfeits, true);
  assert.strictEqual(policy.refundKind, "forfeit_customer_en_route");
  prisma.deliveryRequest.findFirst = originalFindFirst;
}

async function testCourierPostPickupProviderBlocked() {
  prisma.deliveryRequest.findFirst = async () => ({
    fulfillmentStatus: "COLLECTED",
    status: "paid",
  });
  let threw = false;
  try {
    await resolveJobCancellationPolicy(
      { id: "j4c", customerId: "c1", providerId: "p1", laborPaid: true, status: "IN_PROGRESS" },
      { courierFlow: true },
      "p1",
      "PROVIDER"
    );
  } catch (e) {
    threw = true;
    assert.strictEqual(e.statusCode, 409);
    assert.match(e.message, /cannot cancel after picking up items/i);
  }
  assert.strictEqual(threw, true);
  prisma.deliveryRequest.findFirst = originalFindFirst;
}

async function testCourierCollectingProviderOpensDispute() {
  prisma.deliveryRequest.findFirst = async () => ({
    fulfillmentStatus: "COLLECTING",
    status: "paid",
  });
  const policy = await resolveJobCancellationPolicy(
    { id: "j4d", customerId: "c1", providerId: "p1", laborPaid: true, status: "IN_PROGRESS" },
    { courierFlow: true },
    "p1",
    "PROVIDER"
  );
  assert.strictEqual(policy.opensDisputeReview, true);
  assert.strictEqual(policy.cancelledBy, "provider");
  prisma.deliveryRequest.findFirst = originalFindFirst;
}

async function testCourierAwaitingConfirmationCustomerBlocked() {
  prisma.deliveryRequest.findFirst = async () => ({
    fulfillmentStatus: "COMPLETED",
    status: "completed",
  });
  let threw = false;
  try {
    await resolveJobCancellationPolicy(
      { id: "j4e", customerId: "c1", providerId: "p1", laborPaid: true, status: "AWAITING_CONFIRMATION" },
      { courierFlow: true, statusOverride: "AWAITING_CONFIRMATION" },
      "c1",
      "CUSTOMER"
    );
  } catch (e) {
    threw = true;
    assert.strictEqual(e.statusCode, 409);
    assert.match(e.message, /cannot be cancelled after items have been collected/i);
  }
  assert.strictEqual(threw, true);
  prisma.deliveryRequest.findFirst = originalFindFirst;
}

async function testCourierNotEnRouteCustomerOpensDispute() {
  prisma.deliveryRequest.findFirst = async () => ({
    fulfillmentStatus: "PENDING",
    status: "approved",
  });
  const policy = await resolveJobCancellationPolicy(
    { id: "j5", customerId: "c1", providerId: "p1", laborPaid: true, status: "IN_PROGRESS" },
    { courierFlow: true },
    "c1",
    "CUSTOMER"
  );
  assert.strictEqual(policy.opensDisputeReview, true);
  assert.strictEqual(policy.refundAmount, 0);
  prisma.deliveryRequest.findFirst = originalFindFirst;
}

async function testServiceEnRouteDetection() {
  const enRoute = await isProviderEnRouteToService(
    { id: "j6", status: "AWAITING_CONFIRMATION" },
    {}
  );
  assert.strictEqual(enRoute, true);
}

async function testMetaLaborPaidOnlyOpensDispute() {
  const policy = await resolveJobCancellationPolicy(
    { id: "j7", customerId: "c1", providerId: "p1", laborPaid: false, status: "IN_PROGRESS" },
    { laborPaid: true },
    "c1",
    "CUSTOMER"
  );
  assert.strictEqual(policy.opensDisputeReview, true);
  assert.strictEqual(policy.laborPaid, true);
  assert.strictEqual(policy.refundAmount, 0);
}

async function run() {
  await testUnpaidLaborNoDispute();
  await testPaidServiceCustomerOpensDispute();
  await testPaidServiceProviderOpensDispute();
  await testCourierPostPickupCustomerBlocked();
  await testCourierCollectingCustomerForfeits();
  await testCourierPostPickupProviderBlocked();
  await testCourierCollectingProviderOpensDispute();
  await testCourierAwaitingConfirmationCustomerBlocked();
  await testCourierNotEnRouteCustomerOpensDispute();
  await testServiceEnRouteDetection();
  await testMetaLaborPaidOnlyOpensDispute();
  console.log("jobCancellationPolicy.util.test.js: all passed");
}

run().catch((e) => {
  prisma.deliveryRequest.findFirst = originalFindFirst;
  console.error(e);
  process.exit(1);
});
