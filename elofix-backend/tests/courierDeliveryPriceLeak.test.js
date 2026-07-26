/**
 * Rejected/cancelled material-delivery jobs must not inherit a later courier's
 * quoted/paid fee via a reused DeliveryRequest.
 *
 * Run: node tests/courierDeliveryPriceLeak.test.js
 * DB integration only runs when DATABASE_URL is set.
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");

async function cleanup(prisma, fx) {
  if (!fx) return;
  try {
    if (fx.drId) {
      await prisma.deliveryRequest.deleteMany({ where: { id: fx.drId } });
    }
    for (const id of [fx.jobAId, fx.jobBId, fx.parentJobId].filter(Boolean)) {
      await prisma.job.deleteMany({ where: { id } });
    }
    if (fx.orderId) await prisma.materialOrder.deleteMany({ where: { id: fx.orderId } });
    if (fx.branchId) await prisma.branch.deleteMany({ where: { id: fx.branchId } });
    if (fx.supplierId) await prisma.supplier.deleteMany({ where: { id: fx.supplierId } });
    for (const id of [fx.courierAId, fx.courierBId, fx.customerId].filter(Boolean)) {
      await prisma.provider.deleteMany({ where: { userId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
  } catch (e) {
    console.warn("cleanup warning:", e.message);
  }
}

async function createBase(prisma, suffix) {
  const customer = await prisma.user.create({
    data: {
      email: `price-leak-cust-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Price Leak Customer",
      role: "CUSTOMER",
    },
  });
  const courierA = await prisma.user.create({
    data: {
      email: `price-leak-a-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Courier A",
      role: "PROVIDER",
    },
  });
  const courierB = await prisma.user.create({
    data: {
      email: `price-leak-b-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Courier B",
      role: "PROVIDER",
    },
  });
  await prisma.provider.create({
    data: {
      userId: courierA.id,
      skills: ["delivery"],
      location: "Pretoria",
      approved: true,
      profileCompleted: true,
    },
  });
  await prisma.provider.create({
    data: {
      userId: courierB.id,
      skills: ["delivery"],
      location: "Pretoria",
      approved: true,
      profileCompleted: true,
    },
  });

  const supplier = await prisma.supplier.create({
    data: { name: `Supplier ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: {
      supplierId: supplier.id,
      name: `Branch ${suffix}`,
      address: "ABC Builder - belli",
    },
  });

  const parentJob = await prisma.job.create({
    data: {
      title: "pool maintain",
      category: "tiling",
      location: "Pretoria",
      description: "Parent service",
      price: 1000,
      customerId: customer.id,
      status: "IN_PROGRESS",
      meta: {},
    },
  });

  const orderId = randomUUID();
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
        materialsSubtotal: 500,
        total: 500,
        deliveryType: "DELIVERY_PROVIDER",
        payment: { materialsPaid: true, deliveryPaid: false },
      },
    },
  });

  return {
    customerId: customer.id,
    courierAId: courierA.id,
    courierBId: courierB.id,
    supplierId: supplier.id,
    branchId: branch.id,
    parentJobId: parentJob.id,
    orderId,
  };
}

async function testRejectClearsQuotedFee(prisma) {
  const suffix = `rej-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const fx = await createBase(prisma, suffix);
  const deliveryRequestService = require("../src/services/deliveryRequest.service");
  const jobService = require("../src/services/job.service");

  try {
    const { courierJobId, deliveryRequestId } =
      await deliveryRequestService.ensureMaterialCourierJobRequest({
        parentJobId: fx.parentJobId,
        materialOrderId: fx.orderId,
        courierUserId: fx.courierAId,
        customerUserId: fx.customerId,
        collectionPoint: { address: "ABC Builder", city: "Pretoria" },
        destinationPoint: { address: "Pretoria West", city: "Pretoria" },
        items: [{ name: "Cement", qty: 1 }],
        storeName: "ABC Builder - belli",
      });
    fx.jobAId = courierJobId;
    fx.drId = deliveryRequestId;

    await deliveryRequestService.submitDirectDeliveryQuote(deliveryRequestId, fx.courierAId, {
      fee: 300,
      note: "quote",
    });

    let dr = await prisma.deliveryRequest.findUnique({ where: { id: deliveryRequestId } });
    assert.strictEqual(Number(dr.quotedFee), 300);

    await jobService.rejectJobByProvider(courierJobId, "not my skill", null, fx.courierAId);

    dr = await prisma.deliveryRequest.findUnique({ where: { id: deliveryRequestId } });
    assert.strictEqual(String(dr.status), "rejected");
    assert.strictEqual(dr.quotedFee, null, "reject must clear quotedFee");

    const job = await prisma.job.findUnique({ where: { id: courierJobId } });
    assert.strictEqual(Number(job.price), 0);
    const meta = job.meta && typeof job.meta === "object" ? job.meta : {};
    assert.strictEqual(meta.servicePrice, null);

    const enriched = await jobService.getJobById(courierJobId);
    assert.ok(!enriched.deliverySummary?.quotedFee || enriched.deliverySummary.quotedFee === null);
    assert.ok(!(enriched.totalPrice > 0));
  } finally {
    await cleanup(prisma, fx);
  }
}

async function testRejectedJobDoesNotInheritLaterPaidFee(prisma) {
  const suffix = `leak-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const fx = await createBase(prisma, suffix);
  const deliveryRequestService = require("../src/services/deliveryRequest.service");
  const jobService = require("../src/services/job.service");

  try {
    const first = await deliveryRequestService.ensureMaterialCourierJobRequest({
      parentJobId: fx.parentJobId,
      materialOrderId: fx.orderId,
      courierUserId: fx.courierAId,
      customerUserId: fx.customerId,
      collectionPoint: { address: "ABC Builder", city: "Pretoria" },
      destinationPoint: { address: "Pretoria West", city: "Pretoria" },
      items: [{ name: "Cement", qty: 1 }],
      storeName: "ABC Builder - belli",
    });
    fx.jobAId = first.courierJobId;
    fx.drId = first.deliveryRequestId;

    // Reject without quoting (never submitted service price).
    await jobService.rejectJobByProvider(fx.jobAId, "not my skill", null, fx.courierAId);

    // Customer picks another courier — reuses same DeliveryRequest.
    const second = await deliveryRequestService.ensureMaterialCourierJobRequest({
      parentJobId: fx.parentJobId,
      materialOrderId: fx.orderId,
      courierUserId: fx.courierBId,
      customerUserId: fx.customerId,
      collectionPoint: { address: "ABC Builder", city: "Pretoria" },
      destinationPoint: { address: "Pretoria West", city: "Pretoria" },
      items: [{ name: "Cement", qty: 1 }],
      storeName: "ABC Builder - belli",
    });
    fx.jobBId = second.courierJobId;
    assert.strictEqual(second.deliveryRequestId, fx.drId, "DR should be reused");

    const prevMeta = (await prisma.job.findUnique({ where: { id: fx.jobAId } })).meta;
    assert.ok(
      !prevMeta?.deliveryRequestId,
      "rejected job must be detached from reused DeliveryRequest"
    );

    await deliveryRequestService.submitDirectDeliveryQuote(fx.drId, fx.courierBId, {
      fee: 300,
      note: "B quote",
    });

    // Simulate payment settlement onto Job B + shared DR.
    const { commissionAmount, providerAmount } = require("../src/services/payment.service").splitLaborTotalGross(
      300
    );
    await prisma.job.update({
      where: { id: fx.jobBId },
      data: {
        totalPrice: new Prisma.Decimal("300"),
        providerAmount,
        commissionAmount,
        laborPaid: true,
        price: new Prisma.Decimal("300"),
      },
    });
    await prisma.deliveryRequest.update({
      where: { id: fx.drId },
      data: {
        status: "paid",
        quotedFee: new Prisma.Decimal("300"),
        payload: {
          payment: { deliveryPaid: true },
          delivery: { status: "Approved", fee: 300 },
          deliveryQuote: { fee: 300 },
        },
      },
    });
    await deliveryRequestService.syncCourierJobPricingFromDeliveryRow(
      await prisma.deliveryRequest.findUnique({ where: { id: fx.drId } }),
      { paid: true }
    );

    const enrichedA = await jobService.getJobById(fx.jobAId);
    assert.strictEqual(
      enrichedA.deliverySummary,
      null,
      "rejected Job A must not inherit Job B deliverySummary"
    );
    assert.ok(!(Number(enrichedA.totalPrice) > 0), "Job A must not have totalPrice");
    assert.ok(!enrichedA.laborPaid, "Job A must not be laborPaid");
    assert.ok(!(Number(enrichedA.price) > 0), "Job A price must stay 0");
    assert.ok(!enrichedA.servicePrice?.amount, "Job A must not have servicePrice");

    const enrichedB = await jobService.getJobById(fx.jobBId);
    assert.ok(enrichedB.deliverySummary);
    assert.strictEqual(Number(enrichedB.deliverySummary.quotedFee), 300);
    assert.strictEqual(enrichedB.deliverySummary.deliveryPaid, true);
    assert.strictEqual(Number(enrichedB.totalPrice), 300);
    assert.strictEqual(enrichedB.laborPaid, true);
  } finally {
    await cleanup(prisma, fx);
  }
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("courierDeliveryPriceLeak.test.js: skipped (no DATABASE_URL)");
    return;
  }
  const prisma = require("../src/config/prisma");
  await testRejectClearsQuotedFee(prisma);
  await testRejectedJobDoesNotInheritLaterPaidFee(prisma);
  console.log("courierDeliveryPriceLeak.test.js: all tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
