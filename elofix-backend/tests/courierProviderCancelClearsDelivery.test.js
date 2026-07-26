/**
 * Courier job cancel (provider or customer) clears linked material-order delivery
 * so the customer must choose a new option. Non-courier cancels leave delivery unchanged.
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
    if (fixtures.courierJobId) {
      const disputes = await prisma.jobDispute
        .findMany({ where: { jobId: fixtures.courierJobId }, select: { id: true } })
        .catch(() => []);
      for (const d of disputes) {
        await prisma.disputeMessage.deleteMany({ where: { disputeId: d.id } }).catch(() => {});
        await prisma.jobDisputeRound.deleteMany({ where: { disputeId: d.id } }).catch(() => {});
        await prisma.disputeResolutionLog.deleteMany({ where: { disputeId: d.id } }).catch(() => {});
        await prisma.jobDispute.delete({ where: { id: d.id } }).catch(() => {});
      }
      await prisma.providerReview.deleteMany({ where: { jobId: fixtures.courierJobId } }).catch(() => {});
    }
    if (fixtures.rehiredJobId) {
      await prisma.providerReview.deleteMany({ where: { jobId: fixtures.rehiredJobId } }).catch(() => {});
    }
    if (fixtures.deliveryRequestId) {
      await prisma.deliveryRequest.delete({ where: { id: fixtures.deliveryRequestId } }).catch(() => {});
    }
    if (fixtures.rehiredJobId) {
      await prisma.job.delete({ where: { id: fixtures.rehiredJobId } }).catch(() => {});
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
    if (fixtures.courier) {
      await prisma.provider.deleteMany({ where: { userId: fixtures.courier.id } }).catch(() => {});
    }
    if (fixtures.customer) {
      await prisma.user.delete({ where: { id: fixtures.customer.id } }).catch(() => {});
    }
    if (fixtures.courier) {
      await prisma.user.delete({ where: { id: fixtures.courier.id } }).catch(() => {});
    }
  }
}

async function assertDeliveryCleared(prisma, fixtures) {
  const mo = await prisma.materialOrder.findUnique({ where: { id: fixtures.orderId } });
  assert.ok(mo);
  assert.strictEqual(String(mo.payload?.delivery?.status), "Cancelled");
  assert.strictEqual(Number(mo.payload?.deliveryFee ?? 0), 0);
  assert.strictEqual(mo.payload?.deliveryProviderId, undefined);
  assert.strictEqual(mo.payload?.deliveryType, undefined);
  assert.strictEqual(mo.payload?.delivery?.type, undefined);
  assert.strictEqual(mo.payload?.delivery?.providerId, undefined);
  assert.strictEqual(mo.payload?.payment?.deliveryPaid, false);
  assert.strictEqual(mo.payload?.payment?.materialsPaid, true);

  const parentMeta = await getJobMeta(fixtures.parentJob.id);
  const storeOrder = (parentMeta.storeOrders || []).find(
    (o) => String(o.orderId) === String(fixtures.orderId)
  );
  assert.ok(storeOrder);
  assert.strictEqual(String(storeOrder.deliveryStatus), "Cancelled");
  assert.ok(!storeOrder.deliveryType, "deliveryType should be cleared after cancel");
  assert.ok(!storeOrder.deliveryProviderId, "deliveryProviderId should be cleared after cancel");
  assert.ok(!storeOrder.courierJobId, "courierJobId should be cleared after cancel");
  assert.ok(!storeOrder.delivery?.providerId, "delivery.providerId should not fall back to prev");

  const dr = await prisma.deliveryRequest.findUnique({ where: { id: fixtures.deliveryRequestId } });
  assert.ok(dr);
  assert.strictEqual(String(dr.status).toLowerCase(), "cancelled");
  assert.strictEqual(String(dr.fulfillmentStatus || "").toUpperCase(), "CANCELLED");
}

async function seedPaidCollectingCourier(prisma, fixtures) {
  await prisma.provider.upsert({
    where: { userId: fixtures.courier.id },
    create: {
      userId: fixtures.courier.id,
      businessName: "Courier Biz",
      skills: ["delivery"],
      location: "Cape Town",
    },
    update: {},
  });

  await prisma.job.update({
    where: { id: fixtures.courierJobId },
    data: {
      status: "IN_PROGRESS",
      price: 300,
      laborPaid: true,
      meta: {
        courierFlow: true,
        deliveryRequestId: fixtures.deliveryRequestId,
        materialOrderId: fixtures.orderId,
        parentJobId: fixtures.parentJob.id,
        source: "job_materials",
        laborPaid: true,
      },
    },
  });

  await prisma.deliveryRequest.update({
    where: { id: fixtures.deliveryRequestId },
    data: {
      status: "paid",
      fulfillmentStatus: "COLLECTING",
      quotedFee: 300,
      payload: {
        payment: { deliveryPaid: true },
        delivery: { status: "Processing", providerId: fixtures.courier.id, fee: 300 },
      },
    },
  });

  await prisma.materialOrder.update({
    where: { id: fixtures.orderId },
    data: {
      payload: {
        jobStoreOrderId: fixtures.orderId,
        materialsSubtotal: 500,
        total: 800,
        deliveryType: "DELIVERY_PROVIDER",
        deliveryProviderId: fixtures.courier.id,
        deliveryFee: 300,
        payment: { materialsPaid: true, deliveryPaid: true },
        delivery: {
          type: "PROVIDER",
          status: "Processing",
          providerId: fixtures.courier.id,
          fee: 300,
        },
      },
    },
  });
}

async function testCourierCollectingProviderCancelOpensDisputeAndClearsDelivery(prisma, fixtures) {
  await seedPaidCollectingCourier(prisma, fixtures);

  const result = await jobService.cancelJob(
    fixtures.courierJobId,
    "Cannot continue collecting",
    "Mid-collection cancel",
    fixtures.courier.id,
    "provider"
  );

  assert.strictEqual(result.disputeOpened, true);
  assert.ok(result.disputeId);
  assert.strictEqual(String(result.job.status), "DISPUTED");

  const jobRow = await prisma.job.findUnique({ where: { id: fixtures.courierJobId } });
  assert.strictEqual(String(jobRow.meta?.statusOverride || ""), "DISPUTED");
  assert.strictEqual(String(jobRow.meta?.cancellationSource || ""), "provider_cancel");

  const dispute = await prisma.jobDispute.findUnique({ where: { id: result.disputeId } });
  assert.ok(dispute);
  assert.strictEqual(String(dispute.status), "OPEN");

  await assertDeliveryCleared(prisma, fixtures);

  const mo = await prisma.materialOrder.findUnique({ where: { id: fixtures.orderId } });
  assert.strictEqual(mo.payload?.deliveryCancellationReview?.open, true);
  assert.strictEqual(String(mo.payload?.deliveryCancellationReview?.source || ""), "provider_cancel");

  const deliveryRequestService = require("../src/services/deliveryRequest.service");
  let blocked = false;
  try {
    await deliveryRequestService.updateDirectDeliveryFulfillment(
      fixtures.deliveryRequestId,
      fixtures.courier.id,
      "COLLECTED"
    );
  } catch (e) {
    blocked = true;
    assert.strictEqual(e.statusCode, 409);
  }
  assert.strictEqual(blocked, true, "fulfillment must be blocked while disputed");
}

/**
 * After dispute-open clear, customer re-hires a new courier job B on the same MO.
 * Resolving the disputed job A must NOT cancel B or wipe the new assignment.
 */
async function testDisputeResolvePreservesRehiredCourier(prisma, fixtures) {
  await seedPaidCollectingCourier(prisma, fixtures);

  const cancelResult = await jobService.cancelJob(
    fixtures.courierJobId,
    "Cannot continue collecting",
    "Mid-collection cancel for rehire test",
    fixtures.courier.id,
    "provider"
  );
  assert.strictEqual(cancelResult.disputeOpened, true);
  await assertDeliveryCleared(prisma, fixtures);

  const jobBId = randomUUID();
  fixtures.rehiredJobId = jobBId;

  await prisma.job.create({
    data: {
      id: jobBId,
      title: `Material delivery — rehire ${fixtures.orderId.slice(0, 8)}`,
      category: "delivery",
      location: "Cape Town",
      description: "Re-hired courier after dispute",
      price: 500,
      customerId: fixtures.customer.id,
      providerId: fixtures.courier.id,
      status: "IN_PROGRESS",
      laborPaid: true,
      meta: {
        courierFlow: true,
        deliveryRequestId: fixtures.deliveryRequestId,
        materialOrderId: fixtures.orderId,
        parentJobId: fixtures.parentJob.id,
        source: "job_materials",
        laborPaid: true,
      },
    },
  });

  // Same MO has a unique DR — re-hire rebinds the existing request to job B.
  await prisma.deliveryRequest.update({
    where: { id: fixtures.deliveryRequestId },
    data: {
      jobId: jobBId,
      courierId: fixtures.courier.id,
      status: "paid",
      fulfillmentStatus: "COLLECTING",
      quotedFee: 500,
      payload: {
        payment: { deliveryPaid: true },
        delivery: { status: "Processing", providerId: fixtures.courier.id, fee: 500 },
      },
    },
  });

  await prisma.materialOrder.update({
    where: { id: fixtures.orderId },
    data: {
      payload: {
        jobStoreOrderId: fixtures.orderId,
        materialsSubtotal: 500,
        total: 1000,
        deliveryType: "DELIVERY_PROVIDER",
        deliveryProviderId: fixtures.courier.id,
        deliveryFee: 500,
        payment: { materialsPaid: true, deliveryPaid: true },
        delivery: {
          type: "PROVIDER",
          status: "Processing",
          providerId: fixtures.courier.id,
          fee: 500,
        },
        deliveryCancellationReview: {
          open: true,
          source: "provider_cancel",
          courierJobId: fixtures.courierJobId,
          at: new Date().toISOString(),
        },
      },
    },
  });

  const ensureResult =
    await materialOrderService.ensureDeliveryClearedAfterCancellationDisputeResolved(
      fixtures.orderId,
      {
        courierJobId: fixtures.courierJobId,
        source: "provider_cancel",
      }
    );

  assert.strictEqual(ensureResult.cleared, false, "must not clear re-hired assignment");
  assert.ok(ensureResult.reviewClosed || ensureResult.preservedRehire);

  const jobB = await prisma.job.findUnique({ where: { id: jobBId } });
  assert.ok(jobB);
  assert.notStrictEqual(String(jobB.status), "CANCELLED", "re-hired job B must stay active");
  assert.notStrictEqual(String(jobB.meta?.statusOverride || ""), "CANCELLED");

  const mo = await prisma.materialOrder.findUnique({ where: { id: fixtures.orderId } });
  assert.strictEqual(String(mo.payload?.deliveryType || ""), "DELIVERY_PROVIDER");
  assert.strictEqual(String(mo.payload?.deliveryProviderId || ""), String(fixtures.courier.id));
  assert.strictEqual(mo.payload?.deliveryCancellationReview, undefined);

  const dr = await prisma.deliveryRequest.findUnique({ where: { id: fixtures.deliveryRequestId } });
  assert.ok(dr);
  assert.strictEqual(String(dr.jobId), jobBId);
  assert.notStrictEqual(String(dr.status || "").toLowerCase(), "cancelled");
  assert.notStrictEqual(String(dr.fulfillmentStatus || "").toUpperCase(), "CANCELLED");

  // Explicit cancel of disputed A must not rewrite onto B via materialOrderId.
  const deliveryRequestService = require("../src/services/deliveryRequest.service");
  await deliveryRequestService.cancelCourierDeliveryForCustomer({
    materialOrderId: fixtures.orderId,
    courierJobId: fixtures.courierJobId,
    source: "provider_cancel",
    notify: false,
  });
  const jobBAfter = await prisma.job.findUnique({ where: { id: jobBId } });
  assert.notStrictEqual(String(jobBAfter.status), "CANCELLED");
  const drAfter = await prisma.deliveryRequest.findUnique({ where: { id: fixtures.deliveryRequestId } });
  assert.notStrictEqual(String(drAfter.status || "").toLowerCase(), "cancelled");
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
  await assertDeliveryCleared(prisma, fixtures);
}

async function testCourierCustomerCancelClearsDelivery(prisma, fixtures) {
  const result = await jobService.cancelJob(
    fixtures.courierJobId,
    "Changed mind",
    "Customer cancel",
    fixtures.customer.id,
    "customer"
  );

  assert.strictEqual(result.cancelledBy, "customer");
  assert.strictEqual(String(result.job.status), "CANCELLED");
  await assertDeliveryCleared(prisma, fixtures);
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

/**
 * Pre-fix dirty shape: courier job CANCELLED but MO still PROVIDER and DR still COLLECTING.
 * Reading the order / job snapshot must heal via repair-on-read.
 */
async function seedDirtyUnclearedCancelledCourier(prisma, fixtures) {
  await prisma.job.update({
    where: { id: fixtures.courierJobId },
    data: { status: "CANCELLED" },
  });
  await prisma.deliveryRequest.update({
    where: { id: fixtures.deliveryRequestId },
    data: {
      status: "paid",
      fulfillmentStatus: "COLLECTING",
      quotedFee: 300,
      payload: {
        payment: { deliveryPaid: true },
        delivery: { status: "Processing", providerId: fixtures.courier.id, fee: 300 },
      },
    },
  });
  await prisma.materialOrder.update({
    where: { id: fixtures.orderId },
    data: {
      payload: {
        jobStoreOrderId: fixtures.orderId,
        materialsSubtotal: 500,
        total: 800,
        deliveryType: "DELIVERY_PROVIDER",
        deliveryProviderId: fixtures.courier.id,
        deliveryFee: 300,
        payment: { materialsPaid: true, deliveryPaid: true },
        delivery: {
          type: "PROVIDER",
          status: "Processing",
          providerId: fixtures.courier.id,
          fee: 300,
        },
      },
    },
  });
}

async function testRepairOnReadHealsUnclearedCancelledCourier(prisma, fixtures) {
  await seedDirtyUnclearedCancelledCourier(prisma, fixtures);

  const before = await prisma.materialOrder.findUnique({ where: { id: fixtures.orderId } });
  assert.strictEqual(String(before.payload?.deliveryType || ""), "DELIVERY_PROVIDER");
  assert.strictEqual(String(before.payload?.delivery?.status || ""), "Processing");

  const order = await materialOrderService.getMaterialOrderById(fixtures.orderId);
  assert.ok(order);
  assert.strictEqual(String(order.delivery?.status || order.deliveryStatus || ""), "Cancelled");
  assert.ok(!order.deliveryType, "deliveryType should be cleared after repair-on-read");
  assert.ok(!order.deliveryProviderId, "deliveryProviderId should be cleared after repair-on-read");

  const mo = await prisma.materialOrder.findUnique({ where: { id: fixtures.orderId } });
  assert.strictEqual(String(mo.payload?.delivery?.status), "Cancelled");
  assert.strictEqual(mo.payload?.deliveryType, undefined);
  assert.strictEqual(mo.payload?.payment?.materialsPaid, true);
  assert.strictEqual(mo.payload?.payment?.deliveryPaid, false);

  const snapshots = await materialOrderService.getJobMaterialOrdersForJob(fixtures.parentJob.id);
  const snap = snapshots.find((s) => String(s.id) === String(fixtures.orderId));
  assert.ok(snap);
  assert.ok(!snap.deliveryType, "job snapshot deliveryType cleared");
  assert.strictEqual(String(snap.delivery?.status || snap.deliveryStatus || ""), "Cancelled");
  assert.ok(
    !snap.courierFulfillmentStatus || String(snap.courierFulfillmentStatus).toUpperCase() === "CANCELLED",
    "job snapshot must not expose active courier tracking"
  );
}

async function runDbIntegrationTests() {
  const prisma = require("../src/config/prisma");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fixturesList = [];

  try {
    const disputeClearFixtures = await createFixtures(prisma, `${suffix}-dispute`);
    fixturesList.push(disputeClearFixtures);
    await testCourierCollectingProviderCancelOpensDisputeAndClearsDelivery(
      prisma,
      disputeClearFixtures
    );

    const rehireFixtures = await createFixtures(prisma, `${suffix}-rehire`);
    fixturesList.push(rehireFixtures);
    await testDisputeResolvePreservesRehiredCourier(prisma, rehireFixtures);

    const clearFixtures = await createFixtures(prisma, `${suffix}-clear`);
    fixturesList.push(clearFixtures);
    await testCourierProviderCancelClearsDelivery(prisma, clearFixtures);

    const customerClearFixtures = await createFixtures(prisma, `${suffix}-cust`);
    fixturesList.push(customerClearFixtures);
    await testCourierCustomerCancelClearsDelivery(prisma, customerClearFixtures);

    const leaveFixtures = await createFixtures(prisma, `${suffix}-leave`);
    fixturesList.push(leaveFixtures);
    await testNonCourierCancelLeavesDelivery(prisma, leaveFixtures);
    if (leaveFixtures._serviceProvider) {
      fixturesList.push({ courier: leaveFixtures._serviceProvider });
    }

    const repairFixtures = await createFixtures(prisma, `${suffix}-repair`);
    fixturesList.push(repairFixtures);
    await testRepairOnReadHealsUnclearedCancelledCourier(prisma, repairFixtures);

    console.log("courierProviderCancelClearsDelivery.test.js: OK");
  } finally {
    await cleanup(prisma, fixturesList);
    await prisma.$disconnect().catch(() => {});
  }
}

async function main() {
  assert.strictEqual(
    typeof materialOrderService.clearDeliveryAfterCourierJobCancel,
    "function"
  );
  assert.strictEqual(
    typeof materialOrderService.clearDeliveryAfterCourierProviderCancel,
    "function"
  );
  assert.strictEqual(
    typeof materialOrderService.repairUnclearedDeliveryAfterCancelledCourier,
    "function"
  );

  assert.strictEqual(
    typeof materialOrderService.ensureDeliveryClearedAfterCancellationDisputeResolved,
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
