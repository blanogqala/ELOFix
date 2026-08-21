/**
 * FNB Block 4 — transaction-specific checkout legal acceptance.
 *
 * Pure unit tests always run. DB integration runs when DATABASE_URL is set.
 *
 * Run: node tests/checkoutLegalAcceptance.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");

const AppError = require("../src/utils/AppError");
const { LEGAL_VERSIONS } = require("../src/config/legalVersions");
const {
  validateCheckoutLegalAcceptance,
  checkoutRequiresDeliveryPolicy,
  recordCheckoutLegalAcceptance,
  getCheckoutLegalAcceptanceForPaymentIntent,
} = require("../src/services/legalAcceptance.service");
const paymentIntentService = require("../src/services/payments/paymentIntent.service");
const { listEnabledGateways } = require("../src/services/payments/gatewayRegistry");
const { checkoutLegalAcceptance } = require("./helpers/checkoutLegalAcceptance");

function testValidateMissingAcceptance() {
  try {
    validateCheckoutLegalAcceptance(null, "LABOR");
    assert.fail("expected throw");
  } catch (e) {
    assert.ok(e instanceof AppError);
    assert.strictEqual(e.statusCode, 400);
    assert.strictEqual(e.code, "CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED");
  }

  try {
    validateCheckoutLegalAcceptance({ refundPolicyAccepted: false }, "LABOR");
    assert.fail("expected throw");
  } catch (e) {
    assert.strictEqual(e.code, "CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED");
  }
}

function testValidateStaleRefundVersion() {
  try {
    validateCheckoutLegalAcceptance(
      {
        refundPolicyAccepted: true,
        refundPolicyVersion: "1999-01-01",
        deliveryPolicyAcknowledged: false,
        deliveryPolicyVersion: null,
      },
      "LABOR"
    );
    assert.fail("expected throw");
  } catch (e) {
    assert.ok(e instanceof AppError);
    assert.strictEqual(e.statusCode, 409);
    assert.strictEqual(e.code, "LEGAL_POLICY_VERSION_STALE");
  }
}

function testValidateLaborOk() {
  const out = validateCheckoutLegalAcceptance(checkoutLegalAcceptance("LABOR"), "LABOR");
  assert.strictEqual(out.refundPolicyVersion, LEGAL_VERSIONS.refundPolicy);
  assert.strictEqual(out.deliveryPolicyVersion, null);
  assert.strictEqual(out.requiresDelivery, false);
}

function testValidateMaterialRequiresDelivery() {
  assert.strictEqual(checkoutRequiresDeliveryPolicy("MATERIAL_ORDER"), true);
  assert.strictEqual(checkoutRequiresDeliveryPolicy("DELIVERY_FEE"), true);
  assert.strictEqual(checkoutRequiresDeliveryPolicy("LABOR"), false);

  try {
    validateCheckoutLegalAcceptance(
      {
        refundPolicyAccepted: true,
        refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
        deliveryPolicyAcknowledged: false,
        deliveryPolicyVersion: null,
      },
      "MATERIAL_ORDER"
    );
    assert.fail("expected throw");
  } catch (e) {
    assert.strictEqual(e.code, "CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED");
  }

  try {
    validateCheckoutLegalAcceptance(
      {
        refundPolicyAccepted: true,
        refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
        deliveryPolicyAcknowledged: true,
        deliveryPolicyVersion: "stale",
      },
      "MATERIAL_ORDER"
    );
    assert.fail("expected throw");
  } catch (e) {
    assert.strictEqual(e.code, "LEGAL_POLICY_VERSION_STALE");
  }

  const ok = validateCheckoutLegalAcceptance(
    checkoutLegalAcceptance("MATERIAL_ORDER"),
    "MATERIAL_ORDER"
  );
  assert.strictEqual(ok.deliveryPolicyVersion, LEGAL_VERSIONS.deliveryPolicy);
}

function testControllerForwardsLegalAcceptance() {
  const controller = require("../src/controllers/payment.controller");
  const src = controller.createPaymentIntent.toString();
  assert.ok(/body\.legalAcceptance/.test(src), "controller must forward legalAcceptance");
  assert.ok(!/body\.commissionAmount/.test(src));
}

async function createFixtures(prisma, suffix) {
  const user = await prisma.user.create({
    data: {
      email: `checkout.legal.${suffix}@example.com`,
      password: "hashed",
      name: "Checkout Legal",
      role: "CUSTOMER",
    },
  });
  const other = await prisma.user.create({
    data: {
      email: `checkout.legal.other.${suffix}@example.com`,
      password: "hashed",
      name: "Other Customer",
      role: "CUSTOMER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { name: `CL Supplier ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: { supplierId: supplier.id, name: `CL Branch ${suffix}` },
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
  const order = await prisma.materialOrder.create({
    data: {
      userId: user.id,
      supplierId: supplier.id,
      branchId: branch.id,
      paymentStatus: "unpaid",
      materialsSubtotal: 200,
      payload: { totalAmount: 200, deliveryFee: 50, materialsSubtotal: 200, payment: {} },
    },
  });
  const order2 = await prisma.materialOrder.create({
    data: {
      userId: user.id,
      supplierId: supplier.id,
      branchId: branch.id,
      paymentStatus: "unpaid",
      materialsSubtotal: 200,
      payload: { totalAmount: 200, deliveryFee: 50, materialsSubtotal: 200, payment: {} },
    },
  });
  return { user, other, supplier, branch, savedCard, order, order2 };
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
    const intents = await prisma.paymentIntent.findMany({
      where: { materialOrderId: { in: orderIds } },
      select: { id: true },
    });
    const intentIds = intents.map((i) => i.id);
    if (intentIds.length) {
      await prisma.legalAcceptanceEvent
        .deleteMany({ where: { paymentIntentId: { in: intentIds } } })
        .catch(() => {});
    }
    await prisma.paymentIntent.deleteMany({ where: { materialOrderId: { in: orderIds } } }).catch(() => {});
    await prisma.materialOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
  }
  if (fixtures.jobId) {
    await prisma.legalAcceptanceEvent.deleteMany({ where: { jobId: fixtures.jobId } }).catch(() => {});
    await prisma.paymentIntent.deleteMany({ where: { jobId: fixtures.jobId } }).catch(() => {});
    await prisma.job.delete({ where: { id: fixtures.jobId } }).catch(() => {});
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
  for (const u of [fixtures.user, fixtures.other, fixtures.providerUser]) {
    if (u?.id) await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
}

async function testDbEnforcement(prisma, fixtures, provider, recordKeys) {
  const { user, order, order2, savedCard } = fixtures;
  const base = {
    userId: user.id,
    role: "CUSTOMER",
    provider,
    route: "POST /api/payments/intents",
  };

  // Missing acceptance
  let threw = false;
  const kMiss = `cl-miss-${randomUUID()}`;
  recordKeys.push(kMiss);
  try {
    await paymentIntentService.createPaymentIntent({
      ...base,
      kind: "MATERIAL_ORDER",
      materialOrderId: order.id,
      amount: 200,
      idempotencyKey: kMiss,
      requestHash: "h-miss",
    });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, "CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED");
  }
  assert.ok(threw);

  // Stale version
  threw = false;
  const kStale = `cl-stale-${randomUUID()}`;
  recordKeys.push(kStale);
  try {
    await paymentIntentService.createPaymentIntent({
      ...base,
      kind: "MATERIAL_ORDER",
      materialOrderId: order.id,
      amount: 200,
      legalAcceptance: {
        refundPolicyAccepted: true,
        refundPolicyVersion: "stale",
        deliveryPolicyAcknowledged: true,
        deliveryPolicyVersion: LEGAL_VERSIONS.deliveryPolicy,
      },
      idempotencyKey: kStale,
      requestHash: "h-stale",
    });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, "LEGAL_POLICY_VERSION_STALE");
  }
  assert.ok(threw);

  // Material missing delivery ack
  threw = false;
  const kNoDel = `cl-nodel-${randomUUID()}`;
  recordKeys.push(kNoDel);
  try {
    await paymentIntentService.createPaymentIntent({
      ...base,
      kind: "MATERIAL_ORDER",
      materialOrderId: order.id,
      amount: 200,
      legalAcceptance: {
        refundPolicyAccepted: true,
        refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
        deliveryPolicyAcknowledged: false,
        deliveryPolicyVersion: null,
      },
      idempotencyKey: kNoDel,
      requestHash: "h-nodel",
    });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, "CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED");
  }
  assert.ok(threw);

  // Valid material → stores acceptance
  const kOk = `cl-ok-${randomUUID()}`;
  recordKeys.push(kOk);
  const ok = await paymentIntentService.createPaymentIntent({
    ...base,
    kind: "MATERIAL_ORDER",
    materialOrderId: order.id,
    amount: 200,
    legalAcceptance: checkoutLegalAcceptance("MATERIAL_ORDER"),
    idempotencyKey: kOk,
    requestHash: "h-ok",
  });
  assert.ok(ok.intentId);
  const evidence = await getCheckoutLegalAcceptanceForPaymentIntent(ok.intentId);
  assert.ok(evidence);
  assert.strictEqual(evidence.userId, user.id);
  assert.strictEqual(evidence.source, "PAYMENT_CHECKOUT");
  assert.strictEqual(evidence.refundPolicyVersion, LEGAL_VERSIONS.refundPolicy);
  assert.strictEqual(evidence.deliveryPolicyVersion, LEGAL_VERSIONS.deliveryPolicy);
  assert.strictEqual(evidence.merchantReference, ok.merchantReference);
  assert.strictEqual(evidence.materialOrderId, order.id);
  assert.strictEqual(evidence.paymentIntentKind, "MATERIAL_ORDER");

  // Idempotent replay does not create duplicate rows
  const replay = await paymentIntentService.createPaymentIntent({
    ...base,
    kind: "MATERIAL_ORDER",
    materialOrderId: order.id,
    amount: 200,
    legalAcceptance: checkoutLegalAcceptance("MATERIAL_ORDER"),
    idempotencyKey: kOk,
    requestHash: "h-ok",
  });
  assert.strictEqual(replay.intentId, ok.intentId);
  const count = await prisma.legalAcceptanceEvent.count({
    where: { paymentIntentId: ok.intentId, source: "PAYMENT_CHECKOUT" },
  });
  assert.strictEqual(count, 1, "idempotent replay must not duplicate acceptance rows");

  // Delivery fee valid
  const kDel = `cl-del-${randomUUID()}`;
  recordKeys.push(kDel);
  const del = await paymentIntentService.createPaymentIntent({
    ...base,
    kind: "DELIVERY_FEE",
    materialOrderId: order2.id,
    amount: 50,
    legalAcceptance: checkoutLegalAcceptance("DELIVERY_FEE"),
    idempotencyKey: kDel,
    requestHash: "h-del",
  });
  const delEv = await getCheckoutLegalAcceptanceForPaymentIntent(del.intentId);
  assert.ok(delEv);
  assert.strictEqual(delEv.paymentIntentKind, "DELIVERY_FEE");
  assert.strictEqual(delEv.deliveryPolicyVersion, LEGAL_VERSIONS.deliveryPolicy);
}

async function testDbLaborDepositAndCompletion(prisma, fixtures, provider, recordKeys) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const paymentModeService = require("../src/services/payments/paymentMode.service");
  const providerUser = await prisma.user.create({
    data: {
      email: `cl.prov.${suffix}@example.com`,
      password: "x",
      name: "CL Provider",
      role: "PROVIDER",
    },
  });
  fixtures.providerUser = providerUser;
  await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `CL Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const schedule = paymentModeService.computePaymentSchedule("TWO_PAYMENT_50_50", 10000);
  const job = await prisma.job.create({
    data: {
      title: `CL labor ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Checkout legal labor",
      price: 10000,
      totalPrice: 10000,
      customerId: fixtures.user.id,
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
  fixtures.jobId = job.id;

  const kDep = `cl-dep-${randomUUID()}`;
  recordKeys.push(kDep);
  const deposit = await paymentIntentService.createPaymentIntent({
    userId: fixtures.user.id,
    role: "CUSTOMER",
    provider,
    route: "POST /api/payments/intents",
    kind: "LABOR",
    jobId: job.id,
    amount: 5000,
    legalAcceptance: checkoutLegalAcceptance("LABOR"),
    idempotencyKey: kDep,
    requestHash: "h-dep",
  });
  assert.strictEqual(deposit.intent.paymentType, "DEPOSIT");
  const depEv = await getCheckoutLegalAcceptanceForPaymentIntent(deposit.intentId);
  assert.ok(depEv);
  assert.strictEqual(depEv.paymentType, "DEPOSIT");
  assert.strictEqual(depEv.deliveryPolicyVersion, null);
  assert.strictEqual(depEv.jobId, job.id);

  // Mark deposit paid and advance progress so completion is due
  await prisma.paymentIntent.update({
    where: { id: deposit.intentId },
    data: { state: "PAID", paidAt: new Date() },
  });
  await prisma.job.update({
    where: { id: job.id },
    data: {
      paymentProgress: "FIRST_PAID",
      laborPaid: true,
      meta: {
        servicePrice: { amount: 10000 },
        statusOverride: "AWAITING_CONFIRMATION",
      },
    },
  });

  const kComp = `cl-comp-${randomUUID()}`;
  recordKeys.push(kComp);
  const completion = await paymentIntentService.createPaymentIntent({
    userId: fixtures.user.id,
    role: "CUSTOMER",
    provider,
    route: "POST /api/payments/intents",
    kind: "LABOR",
    jobId: job.id,
    amount: 5000,
    legalAcceptance: checkoutLegalAcceptance("LABOR"),
    idempotencyKey: kComp,
    requestHash: "h-comp",
  });
  assert.strictEqual(completion.intent.paymentType, "COMPLETION");
  assert.notStrictEqual(completion.intentId, deposit.intentId);
  const compEv = await getCheckoutLegalAcceptanceForPaymentIntent(completion.intentId);
  assert.ok(compEv);
  assert.strictEqual(compEv.paymentType, "COMPLETION");
  assert.notStrictEqual(compEv.id, depEv.id, "completion must store a separate acceptance event");
}

async function testRecordIdempotency(prisma, fixtures) {
  const intent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-CL-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
      provider: "PAYFAST",
      kind: "LABOR",
      paymentType: "DEPOSIT",
      userId: fixtures.user.id,
      amount: 100,
    },
  });
  const a = await recordCheckoutLegalAcceptance(prisma, {
    userId: fixtures.user.id,
    paymentIntentId: intent.id,
    merchantReference: intent.merchantReference,
    paymentIntentKind: "LABOR",
    paymentType: "DEPOSIT",
    refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
    deliveryPolicyVersion: null,
  });
  const b = await recordCheckoutLegalAcceptance(prisma, {
    userId: fixtures.user.id,
    paymentIntentId: intent.id,
    merchantReference: intent.merchantReference,
    paymentIntentKind: "LABOR",
    paymentType: "DEPOSIT",
    refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
    deliveryPolicyVersion: null,
  });
  assert.strictEqual(a.id, b.id);
  await prisma.legalAcceptanceEvent.deleteMany({ where: { paymentIntentId: intent.id } });
  await prisma.paymentIntent.delete({ where: { id: intent.id } });
}

async function main() {
  testValidateMissingAcceptance();
  testValidateStaleRefundVersion();
  testValidateLaborOk();
  testValidateMaterialRequiresDelivery();
  testControllerForwardsLegalAcceptance();
  console.log("checkoutLegalAcceptance: unit OK");

  if (!process.env.DATABASE_URL) {
    console.log("checkoutLegalAcceptance: skip DB (no DATABASE_URL)");
    return;
  }

  const prisma = require("../src/config/prisma");
  const providers = listEnabledGateways();
  const provider = providers[0] || "PAYFAST";
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const recordKeys = [];
  let fixtures;
  try {
    fixtures = await createFixtures(prisma, suffix);
    await testDbEnforcement(prisma, fixtures, provider, recordKeys);
    await testDbLaborDepositAndCompletion(prisma, fixtures, provider, recordKeys);
    await testRecordIdempotency(prisma, fixtures);
    console.log("checkoutLegalAcceptance: DB OK");
  } finally {
    await cleanup(prisma, fixtures, recordKeys);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
