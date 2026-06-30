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
 *
 * Run: node tests/payments.deliveryFee.test.js
 * DB integration only runs when DATABASE_URL is set.
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");

const paymentIntentService = require("../src/services/payments/paymentIntent.service");
const { listEnabledGateways } = require("../src/services/payments/gatewayRegistry");

function testServiceExports() {
  assert.strictEqual(typeof paymentIntentService.createPaymentIntent, "function");
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
  const makeOrder = () =>
    prisma.materialOrder.create({
      data: {
        userId: user.id,
        supplierId: supplier.id,
        branchId: branch.id,
        paymentStatus: "unpaid",
        payload: { totalAmount: 500, deliveryFee: 100, payment: {} },
      },
    });
  const orderRaw = await makeOrder();
  const orderSvc = await makeOrder();
  return { user, supplier, branch, orderRaw, orderSvc };
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
  const { user, orderSvc } = fixtures;
  const call = (overrides) =>
    paymentIntentService.createPaymentIntent({
      userId: user.id,
      role: "CUSTOMER",
      provider,
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
      console.log("payments.deliveryFee.test.js: OK (DB + service flow)");
    } else {
      console.log(
        "payments.deliveryFee.test.js: OK (DB schema only — no payment gateway enabled/configured)"
      );
    }
  } finally {
    if (recordKeys.length) {
      await prisma.idempotencyRecord
        .deleteMany({ where: { idempotencyKey: { in: recordKeys } } })
        .catch(() => {});
    }
    if (fixtures) {
      const orderIds = [fixtures.orderRaw?.id, fixtures.orderSvc?.id].filter(Boolean);
      await prisma.paymentIntent
        .deleteMany({ where: { materialOrderId: { in: orderIds } } })
        .catch(() => {});
      await prisma.materialOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
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
