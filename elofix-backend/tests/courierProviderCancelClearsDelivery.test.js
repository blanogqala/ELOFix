/**
 * Courier provider cancelJob clears linked material-order delivery so the customer
 * must choose a new option. Non-courier cancels leave delivery unchanged.
 *
 * Run: node tests/courierProviderCancelClearsDelivery.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");

const materialOrderService = require("../src/services/materialOrder.service");
const jobService = require("../src/services/job.service");
const { getJobMeta } = require("../src/services/jobMeta.service");

async function createFixtures(prisma, suffix) {
  const customer = await prisma.user.create({
    data: {
      email: `courier-cancel-clear-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Courier Cancel Customer",
      role: "CUSTOMER",
    },
  });
  const courier = await prisma.user.create({
    data: {
      email: `courier-cancel-provider-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Courier Canceller",
      role: "PROVIDER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { name: `Supplier ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: {
      supplierId: supplier.id,
      name: `Branch ${suffix}`,
      address: "1 Test St, Cape Town",
    },
  });
  const parentJob = await prisma.job.create({
    data: {
      title: `Service ${suffix}`,
      category: "tiling",
      location: "Cape Town",
      description: "Parent service job",
      price: 1000,
      customerId: customer.id,
      meta: { storeOrders: [] },
    },
  });

  const orderId = randomUUID();
  const courierJobId = randomUUID();
  const deliveryRequestId = randomUUID();

  await prisma.materialOrder.create({
    data: {
      id: orderId,
      userId: customer.id,
      supplierId: supplier.id,
      branchId: branch.id,
      jobId: parentJob.id,
      source: "job_materials",
      paymentStatus: "paid",
      fulfillmentStatus: "READY",
      payload: {
        jobStoreOrderId: orderId,
        materialsSubtotal: 500,
        total: 500,
        deliveryType: "DELIVERY_PROVIDER",
        deliveryProviderId: courier.id,
        deliveryFee: 0,
        payment: { materialsPaid: true, deliveryPaid: false },
        delivery: {
          type: "PROVIDER",
          status: "PendingApproval",
          providerId: courier.id,
          fee: 0,
        },
      },
    },
  });

  await prisma.job.create({
    data: {
      id: courierJobId,
      title: `Material delivery — Branch ${suffix}`,
      category: "delivery",
      location: "Cape Town",
      description: "Collect materials and deliver",
      price: 0,
      customerId: customer.id,
      providerId: courier.id,
      status: "PENDING",
      meta: {
        courierFlow: true,
        deliveryRequestId,
        materialOrderId: orderId,
        parentJobId: parentJob.id,
        source: "job_materials",
      },
    },
  });

  await prisma.deliveryRequest.create({
    data: {
      id: deliveryRequestId,
      customerId: customer.id,
      courierId: courier.id,
      source: "job_materials",
      materialOrderId: orderId,
      jobId: courierJobId,
      category: "delivery",
      description: "Material delivery test",
      items: [{ name: "Tiles", qty: 1, weight: 0 }],
      collectionPoint: { address: "1 Test St, Cape Town", label: "Collection point" },
      destinationPoint: { address: "2 Job Site Rd, Milnerton", label: "Delivery destination" },
      status: "pending_quote",
      fulfillmentStatus: "PENDING",
      payload: {
        payment: { deliveryPaid: false },
        delivery: { status: "PendingApproval", providerId: courier.id, fee: 0 },
      },
    },
  });

  await prisma.job.update({
    where: { id: parentJob.id },
    data: {
      meta: {
        storeOrders: [
          {
            orderId,
            storeId: branch.id,
            branchId: branch.id,
            storeName: branch.name,
            deliveryType: "PROVIDER",
            deliveryStatus: "PendingApproval",
            deliveryProviderId: courier.id,
            courierJobId,
            deliveryFee: 0,
            payment: { materialsPaid: true, deliveryPaid: false },
          },
        ],
      },
    },
  });

  return {
    customer,
    courier,
    supplier,
    branch,
    parentJob,
    orderId,
    courierJobId,
    deliveryRequestId,
  };
}

async function cleanup(prisma, fixturesList) {
  for (const fixtures of fixturesList) {
    if (fixtures.deliveryRequestId) {
      await prisma.deliveryRequest.delete({ where: { id: fixtures.deliveryRequestId } }).catch(() => {});
    }
    if (fixtures.courierJobId) {
      await prisma.job.delete({ where: { id: fixtures.courierJobId } }).catch(() => {});
    }
    if (fixtures.orderId) {
      await prisma.materialOrder.delete({ where: { id: fixtures.orderId } }).catch(() => {});
    }
    if (fixtures.parentJob) {
      await prisma.job.delete({ where: { id: fixtures.parentJob.id } }).catch(() => {});
    }
    if (fixtures.branch) {
      await prisma.branch.delete({ where: { id: fixtures.branch.id } }).catch(() => {});
    }
    if (fixtures.supplier) {
      await prisma.supplier.delete({ where: { id: fixtures.supplier.id } }).catch(() => {});
    }
    if (fixtures.customer) {
      await prisma.user.delete({ where: { id: fixtures.customer.id } }).catch(() => {});
    }
    if (fixtures.courier) {
      await prisma.user.delete({ where: { id: fixtures.courier.id } }).catch(() => {});
    }
  }
}

async function testCourierProviderCancelClearsDelivery(prisma, fixtures) {
  const result = await jobService.cancelJob(
    fixtures.courierJobId,
    "Cannot deliver",
    "Test cancel",
    fixtures.courier.id,
    "provider"
  );

  assert.strictEqual(result.cancelledBy, "provider");
  assert.strictEqual(String(result.job.status), "CANCELLED");

  const mo = await prisma.materialOrder.findUnique({ where: { id: fixtures.orderId } });
  assert.ok(mo);
  assert.strictEqual(String(mo.payload?.delivery?.status), "Cancelled");
  assert.strictEqual(Number(mo.payload?.deliveryFee ?? 0), 0);
  assert.strictEqual(mo.payload?.deliveryProviderId, undefined);
  assert.strictEqual(mo.payload?.payment?.deliveryPaid, false);

  const parentMeta = await getJobMeta(fixtures.parentJob.id);
  const storeOrder = (parentMeta.storeOrders || []).find(
    (o) => String(o.orderId) === String(fixtures.orderId)
  );
  assert.ok(storeOrder);
  assert.strictEqual(String(storeOrder.deliveryStatus), "Cancelled");
  assert.ok(!storeOrder.courierJobId, "courierJobId should be cleared after cancel");

  const dr = await prisma.deliveryRequest.findUnique({ where: { id: fixtures.deliveryRequestId } });
  assert.ok(dr);
  assert.strictEqual(String(dr.status).toLowerCase(), "cancelled");
}

async function testNonCourierCancelLeavesDelivery(prisma, fixtures) {
  const serviceProvider = await prisma.user.create({
    data: {
      email: `svc-provider-${fixtures.orderId.slice(0, 8)}@example.com`,
      password: "hashed-placeholder",
      name: "Service Provider",
      role: "PROVIDER",
    },
  });
  fixtures._serviceProvider = serviceProvider;

  await prisma.job.update({
    where: { id: fixtures.parentJob.id },
    data: {
      providerId: serviceProvider.id,
      status: "IN_PROGRESS",
      price: 1000,
    },
  });

  const before = await prisma.materialOrder.findUnique({ where: { id: fixtures.orderId } });
  const beforeStatus = before.payload?.delivery?.status;

  await jobService.cancelJob(
    fixtures.parentJob.id,
    "Cannot continue",
    "Service cancel",
    serviceProvider.id,
    "provider"
  );

  const after = await prisma.materialOrder.findUnique({ where: { id: fixtures.orderId } });
  assert.strictEqual(after.payload?.delivery?.status, beforeStatus);
  assert.strictEqual(String(after.payload?.deliveryType || ""), "DELIVERY_PROVIDER");
}

async function runDbIntegrationTests() {
  const prisma = require("../src/config/prisma");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fixturesList = [];

  try {
    const clearFixtures = await createFixtures(prisma, `${suffix}-clear`);
    fixturesList.push(clearFixtures);
    await testCourierProviderCancelClearsDelivery(prisma, clearFixtures);

    const leaveFixtures = await createFixtures(prisma, `${suffix}-leave`);
    fixturesList.push(leaveFixtures);
    await testNonCourierCancelLeavesDelivery(prisma, leaveFixtures);
    if (leaveFixtures._serviceProvider) {
      fixturesList.push({ courier: leaveFixtures._serviceProvider });
    }

    console.log("courierProviderCancelClearsDelivery.test.js: OK");
  } finally {
    await cleanup(prisma, fixturesList);
    await prisma.$disconnect().catch(() => {});
  }
}

async function main() {
  assert.strictEqual(
    typeof materialOrderService.clearDeliveryAfterCourierProviderCancel,
    "function"
  );

  if (process.env.DATABASE_URL) {
    await runDbIntegrationTests();
  } else {
    console.log(
      "courierProviderCancelClearsDelivery.test.js: OK (unit only, DATABASE_URL not set)"
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
