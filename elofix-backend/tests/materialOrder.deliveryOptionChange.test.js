/**
 * Delivery option change cancels linked courier child jobs and blocks changes after collection starts.
 *
 * Run: node tests/materialOrder.deliveryOptionChange.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");

const materialOrderService = require("../src/services/materialOrder.service");
const { getJobMeta } = require("../src/services/jobMeta.service");
const AppError = require("../src/utils/AppError");

async function createFixtures(prisma, suffix) {
  const customer = await prisma.user.create({
    data: {
      email: `mo-delivery-change-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Delivery Change Customer",
      role: "CUSTOMER",
    },
  });
  const courier = await prisma.user.create({
    data: {
      email: `mo-courier-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Courier Provider",
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
      title: `Tiling ${suffix}`,
      category: "tiling",
      location: "Cape Town",
      description: "Test parent job",
      price: 1000,
      customerId: customer.id,
      meta: { storeOrders: [] },
    },
  });

  const orderId = randomUUID();
  const courierJobId = randomUUID();
  const deliveryRequestId = randomUUID();

  const materialOrder = await prisma.materialOrder.create({
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
    materialOrder,
    orderId,
    courierJobId,
    deliveryRequestId,
  };
}

async function testProviderToStoreCancelsCourier(prisma, fixtures) {
  const { orderId, courierJobId } = fixtures;

  await materialOrderService.updateMaterialOrderDelivery(orderId, {
    type: "STORE",
    status: "PendingApproval",
    fee: 0,
  });

  const courierJob = await prisma.job.findUnique({ where: { id: courierJobId } });
  assert.strictEqual(courierJob.status, "CANCELLED", "courier child job should be cancelled");

  const meta = await getJobMeta(courierJobId);
  assert.strictEqual(meta.cancellationSource, "customer_changed_delivery_option");
  assert.strictEqual(meta.cancellationReason, "Customer changed delivery option");

  const dr = await prisma.deliveryRequest.findFirst({ where: { materialOrderId: orderId } });
  assert.strictEqual(String(dr.status).toLowerCase(), "cancelled");

  const mo = await prisma.materialOrder.findUnique({ where: { id: orderId } });
  const payload = mo.payload;
  assert.strictEqual(payload.deliveryType, "STORE_DELIVERY");
  assert.strictEqual(payload.delivery.type, "STORE");

  const parentMeta = await getJobMeta(fixtures.parentJob.id);
  const storeOrder = parentMeta.storeOrders.find((o) => String(o.orderId) === orderId);
  assert.strictEqual(storeOrder.courierJobId, undefined, "parent storeOrders courierJobId should be cleared");
}

async function testCancelWithDetachedDeliveryRequestJobId(prisma, fixtures) {
  const { orderId, courierJobId } = fixtures;
  await prisma.deliveryRequest.update({
    where: { id: fixtures.deliveryRequestId },
    data: { jobId: null },
  });

  await materialOrderService.updateMaterialOrderDelivery(orderId, {
    type: "SELF",
    status: "SelfCollect",
    fee: 0,
  });

  const courierJob = await prisma.job.findUnique({ where: { id: courierJobId } });
  assert.strictEqual(courierJob.status, "CANCELLED", "should cancel via parent storeOrders courierJobId fallback");
}

async function testRepairStaleCourierJob(prisma, fixtures) {
  const { orderId, courierJobId } = fixtures;
  await prisma.materialOrder.update({
    where: { id: orderId },
    data: {
      payload: {
        materialsSubtotal: 500,
        total: 500,
        deliveryType: "STORE_DELIVERY",
        deliveryFee: 0,
        payment: { materialsPaid: true, deliveryPaid: false },
        delivery: { type: "STORE", status: "PendingApproval", fee: 0 },
      },
    },
  });

  const result = await materialOrderService.repairStaleCourierJobsForMaterialOrder(orderId, {
    notify: false,
  });
  assert.strictEqual(result.repaired, true);

  const courierJob = await prisma.job.findUnique({ where: { id: courierJobId } });
  assert.strictEqual(courierJob.status, "CANCELLED");
}

async function testCollectingBlocksDeliveryChange(prisma, fixtures) {
  const suffix = `${Date.now()}-collecting`;
  const local = await createFixtures(prisma, suffix);
  await prisma.deliveryRequest.update({
    where: { id: local.deliveryRequestId },
    data: { fulfillmentStatus: "COLLECTING" },
  });

  let threw = false;
  try {
    await materialOrderService.updateMaterialOrderDelivery(local.orderId, {
      type: "STORE",
      status: "PendingApproval",
      fee: 0,
    });
  } catch (e) {
    threw = e instanceof AppError && e.statusCode === 409;
  }
  assert.strictEqual(threw, true, "should block delivery change once provider started collecting");

  const courierJob = await prisma.job.findUnique({ where: { id: local.courierJobId } });
  assert.strictEqual(courierJob.status, "PENDING", "courier job should remain pending when blocked");

  return local;
}

async function cleanup(prisma, fixturesList) {
  for (const fixtures of fixturesList) {
    if (!fixtures) continue;
    const orderIds = [fixtures.orderId].filter(Boolean);
    const jobIds = [fixtures.courierJobId, fixtures.parentJob?.id].filter(Boolean);
    const drIds = [fixtures.deliveryRequestId].filter(Boolean);
    await prisma.deliveryRequest.deleteMany({ where: { id: { in: drIds } } }).catch(() => {});
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } }).catch(() => {});
    await prisma.materialOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
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

async function runDbIntegrationTests() {
  const prisma = require("../src/config/prisma");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fixturesList = [];

  try {
    const fixtures = await createFixtures(prisma, suffix);
    fixturesList.push(fixtures);
    await testProviderToStoreCancelsCourier(prisma, fixtures);

    const detachedFixtures = await createFixtures(
      prisma,
      `${suffix}-detached`
    );
    fixturesList.push(detachedFixtures);
    await testCancelWithDetachedDeliveryRequestJobId(prisma, detachedFixtures);

    const repairFixtures = await createFixtures(prisma, `${suffix}-repair`);
    fixturesList.push(repairFixtures);
    await testRepairStaleCourierJob(prisma, repairFixtures);

    const collectingFixtures = await testCollectingBlocksDeliveryChange(prisma, fixtures);
    fixturesList.push(collectingFixtures);

    console.log("materialOrder.deliveryOptionChange.test.js: OK");
  } finally {
    await cleanup(prisma, fixturesList);
    await prisma.$disconnect().catch(() => {});
  }
}

async function main() {
  assert.strictEqual(typeof materialOrderService.updateMaterialOrderDelivery, "function");
  assert.strictEqual(typeof materialOrderService.repairStaleCourierJobsForMaterialOrder, "function");
  assert.strictEqual(typeof materialOrderService.repairAllStaleCourierJobs, "function");

  if (process.env.DATABASE_URL) {
    await runDbIntegrationTests();
  } else {
    console.log("materialOrder.deliveryOptionChange.test.js: OK (unit only, DATABASE_URL not set)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
