/**
 * Security tests: client cannot override financial fields on payment intents.
 *
 * Proves:
 *  - Client amount for MATERIAL_ORDER / DELIVERY_FEE is validation-only (mismatch → 400)
 *  - Persisted order totals are authoritative
 *  - paymentType / commission / recipientUserId are not client-controlled at create
 *  - LABOR wrong stage / amount mismatch is rejected
 *
 * Run: node tests/paymentAmountSecurity.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");

const paymentModeService = require("../src/services/payments/paymentMode.service");
const paymentIntentService = require("../src/services/payments/paymentIntent.service");
const { listEnabledGateways } = require("../src/services/payments/gatewayRegistry");
const { checkoutLegalAcceptance } = require("./helpers/checkoutLegalAcceptance");

function testPaymentTypeDerivedFromKind() {
  assert.strictEqual(paymentModeService.paymentTypeForKind("MATERIAL_ORDER"), "MATERIAL_ORDER");
  assert.strictEqual(paymentModeService.paymentTypeForKind("DELIVERY_FEE"), "DELIVERY_FEE");
  assert.strictEqual(paymentModeService.paymentTypeForKind("JOB_STORE_ORDER"), "JOB_STORE_ORDER");

  // Client hint for LABOR is ignored unless it is a valid labor type AND job stage allows it —
  // paymentTypeForKind with hint still returns the hint when valid, but createPaymentIntent
  // resolves type from job stage only (controller never forwards paymentType).
  const job = {
    paymentModeSnapshot: "TWO_PAYMENT_50_50",
    paymentProgress: "NONE",
    legacyEscrowV2: false,
    firstPaymentAmount: 5000,
    secondPaymentAmount: 5000,
  };
  assert.strictEqual(paymentModeService.resolveNextLaborPaymentType(job, {}), "DEPOSIT");
  // Wrong stage: COMPLETION not due yet
  assert.strictEqual(
    paymentModeService.resolveNextLaborPaymentType(job, { statusOverride: "SERVICE_PAID" }),
    "DEPOSIT"
  );
}

function testControllerDoesNotAcceptFinancialOverrides() {
  // Smoke: controller only forwards known fields — document expected contract.
  const controller = require("../src/controllers/payment.controller");
  assert.strictEqual(typeof controller.createPaymentIntent, "function");
  const src = controller.createPaymentIntent.toString();
  assert.ok(!/body\.commissionAmount/.test(src), "controller must not read commissionAmount");
  assert.ok(!/body\.recipientUserId/.test(src), "controller must not read recipientUserId");
  assert.ok(!/body\.paymentType/.test(src), "controller must not read paymentType from body");
}

async function createFixtures(prisma, suffix) {
  const user = await prisma.user.create({
    data: {
      email: `amt.sec.${suffix}@example.com`,
      password: "hashed",
      name: "Amount Security",
      role: "CUSTOMER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { name: `Amt Supplier ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: { supplierId: supplier.id, name: `Amt Branch ${suffix}` },
  });
  const savedCard = await prisma.savedCard.create({
    data: {
      userId: user.id,
      brand: "visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2035,
      isDefault: true,
    },
  });
  const makeOrder = () =>
    prisma.materialOrder.create({
      data: {
        userId: user.id,
        supplierId: supplier.id,
        branchId: branch.id,
        paymentStatus: "unpaid",
        materialsSubtotal: 500,
        payload: { totalAmount: 500, deliveryFee: 100, materialsSubtotal: 500, payment: {} },
      },
    });
  const order = await makeOrder();
  const order2 = await makeOrder();
  return { user, supplier, branch, savedCard, order, order2 };
}

async function cleanup(prisma, fixtures, recordKeys) {
  if (recordKeys?.length) {
    await prisma.idempotencyRecord
      .deleteMany({ where: { idempotencyKey: { in: recordKeys } } })
      .catch(() => {});
  }
  if (!fixtures) return;
  const orderIds = [fixtures.order?.id, fixtures.order2?.id].filter(Boolean);
  if (orderIds.length) {
    await prisma.paymentIntent.deleteMany({ where: { materialOrderId: { in: orderIds } } }).catch(() => {});
    await prisma.materialOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
  }
  if (fixtures.savedCard?.id) {
    await prisma.savedCard.delete({ where: { id: fixtures.savedCard.id } }).catch(() => {});
  }
  if (fixtures.branch?.id) {
    await prisma.branch.delete({ where: { id: fixtures.branch.id } }).catch(() => {});
  }
  if (fixtures.supplier?.id) {
    await prisma.supplier.delete({ where: { id: fixtures.supplier.id } }).catch(() => {});
  }
  if (fixtures.user?.id) {
    await prisma.user.delete({ where: { id: fixtures.user.id } }).catch(() => {});
  }
}

async function testMaterialAmountServerAuthoritative(prisma, fixtures, provider, recordKeys) {
  const { user, order, order2, savedCard } = fixtures;

  // Tampered low amount rejected (before any intent exists)
  const kLow = `amt-low-${randomUUID()}`;
  recordKeys.push(kLow);
  let threw = false;
  try {
    await paymentIntentService.createPaymentIntent({
      userId: user.id,
      role: "CUSTOMER",
      provider,
      route: "POST /api/payments/intents",
      kind: "MATERIAL_ORDER",
      legalAcceptance: checkoutLegalAcceptance("MATERIAL_ORDER"),
      materialOrderId: order.id,
      amount: 1,
      idempotencyKey: kLow,
      requestHash: "h-low",
    });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.statusCode, 400);
  }
  assert.ok(threw, "tampered low amount must be rejected");

  // Omit amount → server uses persisted total
  const kOmit = `amt-omit-${randomUUID()}`;
  recordKeys.push(kOmit);
  const omitted = await paymentIntentService.createPaymentIntent({
    userId: user.id,
    role: "CUSTOMER",
    provider,
    route: "POST /api/payments/intents",
    kind: "MATERIAL_ORDER",
    legalAcceptance: checkoutLegalAcceptance("MATERIAL_ORDER"),
    materialOrderId: order.id,
    amount: undefined,
    idempotencyKey: kOmit,
    requestHash: "h-omit",
  });
  assert.strictEqual(Number(omitted.intent.amount), 500);
  assert.strictEqual(omitted.intent.paymentType, "MATERIAL_ORDER");
  assert.strictEqual(Number(omitted.intent.commissionAmount || 0), 0);
  assert.strictEqual(omitted.intent.recipientUserId || null, null);

  // Correct amount on a second order
  const kOk = `amt-ok-${randomUUID()}`;
  recordKeys.push(kOk);
  const ok = await paymentIntentService.createPaymentIntent({
    userId: user.id,
    role: "CUSTOMER",
    provider,
    route: "POST /api/payments/intents",
    kind: "MATERIAL_ORDER",
    legalAcceptance: checkoutLegalAcceptance("MATERIAL_ORDER"),
    materialOrderId: order2.id,
    amount: 500,
    idempotencyKey: kOk,
    requestHash: "h-ok",
  });
  assert.strictEqual(Number(ok.intent.amount), 500);

  // Delivery fee: mismatch rejected; correct uses payload.deliveryFee
  const kDelBad = `amt-del-bad-${randomUUID()}`;
  recordKeys.push(kDelBad);
  threw = false;
  try {
    await paymentIntentService.createPaymentIntent({
      userId: user.id,
      role: "CUSTOMER",
      provider,
      route: "POST /api/payments/intents",
      kind: "DELIVERY_FEE",
      legalAcceptance: checkoutLegalAcceptance("DELIVERY_FEE"),
      materialOrderId: order.id,
      amount: 1,
      idempotencyKey: kDelBad,
      requestHash: "h-del-bad",
    });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.statusCode, 400);
  }
  assert.ok(threw, "tampered delivery fee must be rejected");

  const kDel = `amt-del-${randomUUID()}`;
  recordKeys.push(kDel);
  const del = await paymentIntentService.createPaymentIntent({
    userId: user.id,
    role: "CUSTOMER",
    provider,
    route: "POST /api/payments/intents",
    kind: "DELIVERY_FEE",
    legalAcceptance: checkoutLegalAcceptance("DELIVERY_FEE"),
    materialOrderId: order.id,
    amount: 100,
    idempotencyKey: kDel,
    requestHash: "h-del",
  });
  assert.strictEqual(Number(del.intent.amount), 100);
  assert.strictEqual(del.intent.paymentType, "DELIVERY_FEE");
}

async function testLaborStageAndAmountSecurity(prisma, provider, recordKeys) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await prisma.user.create({
    data: {
      email: `amt.lab.cust.${suffix}@example.com`,
      password: "x",
      name: "Lab Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `amt.lab.prov.${suffix}@example.com`,
      password: "x",
      name: "Lab Provider",
      role: "PROVIDER",
    },
  });
  await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Lab Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const savedCard = await prisma.savedCard.create({
    data: {
      userId: customer.id,
      brand: "visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2035,
      isDefault: true,
    },
  });
  const schedule = paymentModeService.computePaymentSchedule("TWO_PAYMENT_50_50", 10000);
  const job = await prisma.job.create({
    data: {
      title: `Amt labor ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Amount security labor job",
      price: 10000,
      totalPrice: 10000,
      customerId: customer.id,
      providerId: providerUser.id,
      status: "ACCEPTED",
      legacyEscrowV2: false,
      paymentModeSnapshot: "TWO_PAYMENT_50_50",
      quotedAmount: schedule.quotedAmount,
      firstPaymentAmount: schedule.firstPaymentAmount,
      secondPaymentAmount: schedule.secondPaymentAmount,
      paymentProgress: "NONE",
      meta: {
        servicePrice: { amount: 10000 },
        statusOverride: "SERVICE_PRICE_SUBMITTED",
      },
    },
  });

  try {
    const kMismatch = `lab-mis-${randomUUID()}`;
    recordKeys.push(kMismatch);
    let threw = false;
    try {
      await paymentIntentService.createPaymentIntent({
        userId: customer.id,
        role: "CUSTOMER",
        provider,
        route: "POST /api/payments/intents",
        kind: "LABOR",
        legalAcceptance: checkoutLegalAcceptance("LABOR"),
        jobId: job.id,
        amount: 1,
        idempotencyKey: kMismatch,
        requestHash: "h-lab-mis",
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 400);
    }
    assert.ok(threw, "LABOR amount mismatch must be rejected");

    const kOk = `lab-ok-${randomUUID()}`;
    recordKeys.push(kOk);
    const ok = await paymentIntentService.createPaymentIntent({
      userId: customer.id,
      role: "CUSTOMER",
      provider,
      route: "POST /api/payments/intents",
      kind: "LABOR",
      legalAcceptance: checkoutLegalAcceptance("LABOR"),
      jobId: job.id,
      amount: 5000,
      // These must be ignored even if somehow passed through service options
      commissionAmount: 999,
      recipientUserId: customer.id,
      paymentType: "COMPLETION",
      idempotencyKey: kOk,
      requestHash: "h-lab-ok",
    });
    assert.strictEqual(Number(ok.intent.amount), 5000);
    assert.strictEqual(ok.intent.paymentType, "DEPOSIT");
    assert.notStrictEqual(Number(ok.intent.commissionAmount || 0), 999);
  } finally {
    await prisma.paymentIntent.deleteMany({ where: { jobId: job.id } }).catch(() => {});
    await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
    await prisma.savedCard.delete({ where: { id: savedCard.id } }).catch(() => {});
    await prisma.provider.deleteMany({ where: { userId: providerUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: providerUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: customer.id } }).catch(() => {});
  }
}

async function main() {
  testPaymentTypeDerivedFromKind();
  testControllerDoesNotAcceptFinancialOverrides();

  if (!process.env.DATABASE_URL) {
    console.log("paymentAmountSecurity.test.js: OK (unit only, DATABASE_URL not set)");
    return;
  }

  const prisma = require("../src/config/prisma");
  const providers = listEnabledGateways();
  if (!providers.length) {
    console.log("paymentAmountSecurity.test.js: OK (unit only, no payment gateway)");
    await prisma.$disconnect().catch(() => {});
    return;
  }

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const recordKeys = [];
  let fixtures = null;
  try {
    fixtures = await createFixtures(prisma, suffix);
    await testMaterialAmountServerAuthoritative(prisma, fixtures, providers[0], recordKeys);
    await testLaborStageAndAmountSecurity(prisma, providers[0], recordKeys);
    console.log("paymentAmountSecurity.test.js: OK");
  } finally {
    await cleanup(prisma, fixtures, recordKeys);
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
