/**
 * Regression tests for the materials + delivery-fee payment flow.
 *
 * Covers:
 *  - Composite uniqueness ([materialOrderId, kind]) allows multiple kinds per order
 *    but still blocks duplicate intents of the same kind.
 *  - Materials payment then delivery-fee payment succeeds.
 *  - An already-PAID materials intent does not block delivery-fee payment.
 *  - Duplicate delivery-fee attempts reuse the existing intent (no duplicate rows).
 *  - Idempotency replay still returns the same intent.
 *  - After delivery clear (cancel), a PAID DELIVERY_FEE intent is cancelled and
 *    createPaymentIntent can start a new delivery pay without P2002.
 *
 * Run: node tests/payments.deliveryFee.test.js
 * DB integration only runs when DATABASE_URL is set.
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");

const paymentIntentService = require("../src/services/payments/paymentIntent.service");
const materialOrderService = require("../src/services/materialOrder.service");
const { listEnabledGateways } = require("../src/services/payments/gatewayRegistry");

function testServiceExports() {
  assert.strictEqual(typeof paymentIntentService.createPaymentIntent, "function");
  assert.strictEqual(typeof paymentIntentService.cancelDeliveryFeeIntentsForMaterialOrder, "function");
}

async function createFixtures(prisma, suffix) {
  const user = await prisma.user.create({
    data: {
      email: `pay-delivery-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Pay Delivery Test",
      role: "CUSTOMER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { name: `Supplier ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: { supplierId: supplier.id, name: `Branch ${suffix}` },
  });
  const savedCard = await prisma.savedCard.create({
    data: {
      userId: user.id,
      brand: "visa",
      last4: "4680",
      expiryMonth: 12,
      expiryYear: 2030,
      isDefault: true,
    },
  });
  const makeOrder = (payloadExtra = {}) =>
    prisma.materialOrder.create({
      data: {
        userId: user.id,
        supplierId: supplier.id,
        branchId: branch.id,
        paymentStatus: "unpaid",
        materialsSubtotal: 500,
        payload: { totalAmount: 500, deliveryFee: 100, materialsSubtotal: 500, payment: {}, ...payloadExtra },
      },
    });
  const orderRaw = await makeOrder();
  const orderSvc = await makeOrder();
  const orderRepay = await makeOrder({
    payment: { materialsPaid: true, deliveryPaid: true },
    deliveryType: "DELIVERY_PROVIDER",
    deliveryFee: 100,
    delivery: { type: "PROVIDER", status: "Processing", fee: 100 },
  });
  const orderJobIdRefresh = await makeOrder({
    payment: { materialsPaid: true, deliveryPaid: false },
    deliveryType: "DELIVERY_PROVIDER",
    deliveryFee: 100,
    delivery: { type: "PROVIDER", status: "Approved", fee: 100 },
  });
  return { user, supplier, branch, savedCard, orderRaw, orderSvc, orderRepay, orderJobIdRefresh };
}

async function testCompositeUniqueness(prisma, fixtures) {
  const { user, orderRaw } = fixtures;
  const base = (kind) => ({
    id: randomUUID(),
    merchantReference: `EF-${randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase()}`,
    provider: "PAYFAST",
    kind,
    userId: user.id,
    materialOrderId: orderRaw.id,
    amount: 100,
  });

  // Two different kinds for the same order are allowed.
  await prisma.paymentIntent.create({ data: base("MATERIAL_ORDER") });
  await prisma.paymentIntent.create({ data: base("DELIVERY_FEE") });

  // A second intent of the same kind for the same order must violate the composite unique.
  let threw = false;
  try {
    await prisma.paymentIntent.create({ data: base("DELIVERY_FEE") });
  } catch (e) {
    threw = e.code === "P2002";
  }
  assert.strictEqual(threw, true, "duplicate (materialOrderId, kind) should hit P2002");
}

async function testServiceFlow(prisma, fixtures, provider, recordKeys) {
  const { user, orderSvc, savedCard } = fixtures;
  const call = (overrides) =>
    paymentIntentService.createPaymentIntent({
      userId: user.id,
      role: "CUSTOMER",
      provider,
      cardId: savedCard.id,
      cvv: "123",
      route: "POST /api/payments/intents",
      ...overrides,
    });

  // 1. Materials payment.
  const kMat = `idem-mat-${randomUUID()}`;
  recordKeys.push(kMat);
  const mat = await call({
    kind: "MATERIAL_ORDER",
    materialOrderId: orderSvc.id,
    amount: 500,
    idempotencyKey: kMat,
    requestHash: "hash-mat",
  });
  assert.strictEqual(mat.intent.kind, "MATERIAL_ORDER");

  // Materials marked PAID — must NOT block the delivery-fee intent.
  await prisma.paymentIntent.update({
    where: { id: mat.intentId },
    data: { state: "PAID", paidAt: new Date() },
  });

  // 2. Delivery fee payment after materials paid.
  const kDel = `idem-del-${randomUUID()}`;
  recordKeys.push(kDel);
  const del1 = await call({
    kind: "DELIVERY_FEE",
    materialOrderId: orderSvc.id,
    amount: 100,
    idempotencyKey: kDel,
    requestHash: "hash-del",
  });
  assert.strictEqual(del1.intent.kind, "DELIVERY_FEE");
  assert.notStrictEqual(del1.intentId, mat.intentId, "delivery intent is distinct from materials");

  // 3. Duplicate delivery-fee attempt (new idempotency key) reuses the same intent.
  const kDel2 = `idem-del2-${randomUUID()}`;
  recordKeys.push(kDel2);
  const del2 = await call({
    kind: "DELIVERY_FEE",
    materialOrderId: orderSvc.id,
    amount: 100,
    idempotencyKey: kDel2,
    requestHash: "hash-del2",
  });
  assert.strictEqual(del2.intentId, del1.intentId, "duplicate delivery attempt reuses intent");
  assert.strictEqual(del2.reused, true, "reuse path flagged");

  const deliveryCount = await prisma.paymentIntent.count({
    where: { materialOrderId: orderSvc.id, kind: "DELIVERY_FEE" },
  });
  assert.strictEqual(deliveryCount, 1, "no duplicate delivery-fee rows");

  // 4. Idempotency replay (same key + same payload) returns the same intent.
  const replay = await call({
    kind: "DELIVERY_FEE",
    materialOrderId: orderSvc.id,
    amount: 100,
    idempotencyKey: kDel,
    requestHash: "hash-del",
  });
  assert.strictEqual(replay.intentId, del1.intentId, "idempotency replay returns same intent");
  assert.strictEqual(replay.replay, true, "replay flag preserved");
}

/**
 * Simulates cancel → re-choose → pay delivery again:
 * PAID DELIVERY_FEE remains while MO.deliveryPaid is cleared → must not P2002.
 */
async function testRepayAfterDeliveryClear(prisma, fixtures, provider, recordKeys) {
  const { user, orderRepay, savedCard } = fixtures;

  const paidIntent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-${randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase()}`,
      provider: "PAYFAST",
      kind: "DELIVERY_FEE",
      userId: user.id,
      materialOrderId: orderRepay.id,
      amount: 100,
      state: "PAID",
      paidAt: new Date(),
    },
  });

  const originalMerchantRef = paidIntent.merchantReference;

  await materialOrderService.clearDeliveryAfterCourierJobCancel(orderRepay.id, {
    source: "customer_cancel",
  });

  const afterClear = await prisma.paymentIntent.findUnique({ where: { id: paidIntent.id } });
  assert.strictEqual(String(afterClear.state), "CANCELLED", "clear cancels DELIVERY_FEE intent");

  const mo = await prisma.materialOrder.findUnique({ where: { id: orderRepay.id } });
  assert.strictEqual(mo.payload?.payment?.deliveryPaid, false);
  // Restore a fee so createPaymentIntent can resolve amount after clear wiped deliveryFee.
  await prisma.materialOrder.update({
    where: { id: orderRepay.id },
    data: {
      payload: {
        ...mo.payload,
        deliveryFee: 100,
        delivery: { ...(mo.payload?.delivery || {}), status: "Approved", fee: 100, type: "PROVIDER" },
        deliveryType: "DELIVERY_PROVIDER",
        payment: { ...(mo.payload?.payment || {}), materialsPaid: true, deliveryPaid: false },
      },
    },
  });

  const kRepay = `idem-repay-${randomUUID()}`;
  recordKeys.push(kRepay);
  const repay = await paymentIntentService.createPaymentIntent({
    userId: user.id,
    role: "CUSTOMER",
    provider,
    kind: "DELIVERY_FEE",
    materialOrderId: orderRepay.id,
    amount: 100,
    cardId: savedCard.id,
    cvv: "123",
    idempotencyKey: kRepay,
    requestHash: "hash-repay",
    route: "POST /api/payments/intents",
  });

  assert.ok(repay.intentId, "repay creates/reuses an intent");
  assert.strictEqual(repay.intent.kind, "DELIVERY_FEE");
  assert.strictEqual(String(repay.intent.state), "PENDING");
  assert.strictEqual(repay.intentId, paidIntent.id, "reuses the cancelled intent row");
  assert.strictEqual(repay.reused, true);
  assert.notStrictEqual(
    repay.merchantReference,
    originalMerchantRef,
    "reuse must mint a new merchant reference for a fresh PayFast/settle cycle"
  );

  // Sandbox return settle must succeed even if a prior sandbox-return event exists for this intent id.
  await prisma.paymentWebhookEvent.create({
    data: {
      id: randomUUID(),
      provider: "PAYFAST",
      externalEventId: `sandbox-return-${paidIntent.id}`,
      paymentIntentId: paidIntent.id,
      signatureValid: true,
      rawPayload: { source: "prior_attempt" },
      processedAt: new Date(),
    },
  });

  const confirmed = await paymentIntentService.confirmPaymentReturn(
    repay.intentId,
    user.id,
    "CUSTOMER"
  );
  assert.strictEqual(String(confirmed.intent.state), "PAID", "return settle must mark PAID after reuse");

  const count = await prisma.paymentIntent.count({
    where: { materialOrderId: orderRepay.id, kind: "DELIVERY_FEE" },
  });
  assert.strictEqual(count, 1, "still a single DELIVERY_FEE row after repay");
}

/**
 * After cancel/re-hire, reused DELIVERY_FEE intent must refresh jobId to the new courier job
 * so PaymentReturn "Back to job" does not open the cancelled job.
 */
async function testRepayRefreshesJobIdToNewCourier(prisma, fixtures, provider, recordKeys) {
  const { user, orderJobIdRefresh, savedCard } = fixtures;

  const jobAId = randomUUID();
  const jobBId = randomUUID();
  const drId = randomUUID();

  await prisma.job.create({
    data: {
      id: jobAId,
      title: "Courier A cancelled",
      category: "delivery",
      location: "Cape Town",
      description: "Old courier",
      price: 300,
      customerId: user.id,
      status: "CANCELLED",
      meta: { courierFlow: true, materialOrderId: orderJobIdRefresh.id },
    },
  });
  await prisma.job.create({
    data: {
      id: jobBId,
      title: "Courier B active",
      category: "delivery",
      location: "Cape Town",
      description: "New courier",
      price: 100,
      customerId: user.id,
      status: "IN_PROGRESS",
      meta: { courierFlow: true, materialOrderId: orderJobIdRefresh.id },
    },
  });
  await prisma.deliveryRequest.create({
    data: {
      id: drId,
      customerId: user.id,
      source: "job_materials",
      materialOrderId: orderJobIdRefresh.id,
      jobId: jobBId,
      category: "delivery",
      description: "Material delivery",
      items: [{ name: "Tiles", qty: 1 }],
      collectionPoint: { address: "1 Test St" },
      destinationPoint: { address: "2 Job Site" },
      status: "approved",
      fulfillmentStatus: "READY",
      quotedFee: 100,
      payload: { payment: { deliveryPaid: false } },
    },
  });

  const paidIntent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-${randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase()}`,
      provider: "PAYFAST",
      kind: "DELIVERY_FEE",
      userId: user.id,
      materialOrderId: orderJobIdRefresh.id,
      jobId: jobAId,
      amount: 100,
      state: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  const kRepay = `idem-repay-jobid-${randomUUID()}`;
  recordKeys.push(kRepay);
  const repay = await paymentIntentService.createPaymentIntent({
    userId: user.id,
    role: "CUSTOMER",
    provider,
    kind: "DELIVERY_FEE",
    materialOrderId: orderJobIdRefresh.id,
    jobId: jobBId,
    amount: 100,
    cardId: savedCard.id,
    cvv: "123",
    metadata: { deliveryRequestId: drId },
    idempotencyKey: kRepay,
    requestHash: "hash-repay-jobid",
    route: "POST /api/payments/intents",
  });

  assert.strictEqual(repay.intentId, paidIntent.id, "reuses cancelled intent row");
  assert.strictEqual(repay.reused, true);
  assert.strictEqual(
    String(repay.intent.jobId),
    jobBId,
    "reused intent jobId must be the new courier job, not cancelled A"
  );

  const row = await prisma.paymentIntent.findUnique({ where: { id: paidIntent.id } });
  assert.strictEqual(String(row.jobId), jobBId);

  fixtures._extraJobIds = [jobAId, jobBId];
  fixtures._extraDrId = drId;
}

async function runDbIntegrationTests() {
  const prisma = require("../src/config/prisma");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const recordKeys = [];
  let fixtures = null;

  try {
    fixtures = await createFixtures(prisma, suffix);
    await testCompositeUniqueness(prisma, fixtures);

    const providers = listEnabledGateways();
    if (providers.length) {
      await testServiceFlow(prisma, fixtures, providers[0], recordKeys);
      await testRepayAfterDeliveryClear(prisma, fixtures, providers[0], recordKeys);
      await testRepayRefreshesJobIdToNewCourier(prisma, fixtures, providers[0], recordKeys);
      console.log("payments.deliveryFee.test.js: OK (DB + service flow)");
    } else {
      // Still verify clear cancels PAID delivery intents without a gateway.
      await prisma.paymentIntent.create({
        data: {
          id: randomUUID(),
          merchantReference: `EF-${randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase()}`,
          provider: "PAYFAST",
          kind: "DELIVERY_FEE",
          userId: fixtures.user.id,
          materialOrderId: fixtures.orderRepay.id,
          amount: 100,
          state: "PAID",
          paidAt: new Date(),
        },
      });
      await materialOrderService.clearDeliveryAfterCourierJobCancel(fixtures.orderRepay.id, {
        source: "customer_cancel",
      });
      const intent = await prisma.paymentIntent.findFirst({
        where: { materialOrderId: fixtures.orderRepay.id, kind: "DELIVERY_FEE" },
      });
      assert.strictEqual(String(intent.state), "CANCELLED");
      console.log(
        "payments.deliveryFee.test.js: OK (DB schema + clear cancels intent — no payment gateway)"
      );
    }
  } finally {
    if (recordKeys.length) {
      await prisma.idempotencyRecord
        .deleteMany({ where: { idempotencyKey: { in: recordKeys } } })
        .catch(() => {});
    }
    if (fixtures) {
      const orderIds = [
        fixtures.orderRaw?.id,
        fixtures.orderSvc?.id,
        fixtures.orderRepay?.id,
        fixtures.orderJobIdRefresh?.id,
      ].filter(Boolean);
      const intentRows = await prisma.paymentIntent
        .findMany({
          where: { materialOrderId: { in: orderIds } },
          select: { id: true },
        })
        .catch(() => []);
      const intentIds = (intentRows || []).map((r) => r.id);
      if (intentIds.length) {
        await prisma.paymentWebhookEvent
          .deleteMany({ where: { paymentIntentId: { in: intentIds } } })
          .catch(() => {});
      }
      await prisma.paymentIntent
        .deleteMany({ where: { materialOrderId: { in: orderIds } } })
        .catch(() => {});
      if (fixtures._extraDrId) {
        await prisma.deliveryRequest.delete({ where: { id: fixtures._extraDrId } }).catch(() => {});
      }
      if (Array.isArray(fixtures._extraJobIds)) {
        for (const jid of fixtures._extraJobIds) {
          await prisma.job.delete({ where: { id: jid } }).catch(() => {});
        }
      }
      await prisma.materialOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
      if (fixtures.savedCard) {
        await prisma.savedCard.delete({ where: { id: fixtures.savedCard.id } }).catch(() => {});
      }
      if (fixtures.branch) {
        await prisma.branch.delete({ where: { id: fixtures.branch.id } }).catch(() => {});
      }
      if (fixtures.supplier) {
        await prisma.supplier.delete({ where: { id: fixtures.supplier.id } }).catch(() => {});
      }
      if (fixtures.user) {
        await prisma.user.delete({ where: { id: fixtures.user.id } }).catch(() => {});
      }
    }
    await prisma.$disconnect().catch(() => {});
  }
}

async function main() {
  testServiceExports();

  if (process.env.DATABASE_URL) {
    await runDbIntegrationTests();
  } else {
    console.log("payments.deliveryFee.test.js: OK (unit only, DATABASE_URL not set)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
