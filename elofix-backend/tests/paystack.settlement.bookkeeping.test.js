/**
 * Phase D2 Block 3 correction — Paystack split-at-charge bookkeeping
 * must not require bank verification. Run: node tests/paystack.settlement.bookkeeping.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const branchSettlementService = require("../src/services/branchSettlement.service");
const paystack = require("../src/services/payments/paystack.gateway");

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const key of keys) prev[key] = process.env[key];
  const restore = () => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(restore);
}

function paystackEnv() {
  return {
    MARKETPLACE_SETTLEMENT_ENABLED: "true",
    ENABLED_PAYMENT_PROVIDERS: "payfast,paystack",
    PAYSTACK_MODE: "test",
    PAYSTACK_SECRET_KEY: "sk_test_unit_not_a_real_key",
    PAYSTACK_PUBLIC_KEY: "pk_test_unit_not_a_real_key",
  };
}

async function seedFixture(suffix, { provider, verificationStatus, recipientId, gatewayPayload }) {
  const customer = await prisma.user.create({
    data: {
      email: `bk.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const supplierUser = await prisma.user.create({
    data: {
      email: `bk.sup.${suffix}@example.com`,
      password: "x",
      name: "Supplier",
      role: "SUPPLIER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: {
      userId: supplierUser.id,
      name: `Supplier ${suffix}`,
      businessName: `Biz ${suffix}`,
    },
  });
  const branch = await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId: supplier.id,
      name: `Branch ${suffix}`,
      address: "1 Test",
      products: [],
    },
  });
  const profile = await prisma.branchWithdrawalProfile.create({
    data: {
      id: randomUUID(),
      branchId: branch.id,
      bankName: "FNB",
      accountHolder: "Branch Holder",
      accountNumber: "enc:test",
      branchCode: "enc:test",
      verificationStatus,
      gatewayProvider: "PAYSTACK",
      gatewayRecipientId: recipientId,
      gatewayProfileStatus: "PENDING",
      isActive: true,
    },
  });
  const orderId = randomUUID();
  const intentId = randomUUID();
  await prisma.materialOrder.create({
    data: {
      id: orderId,
      userId: customer.id,
      supplierId: supplier.id,
      branchId: branch.id,
      paymentStatus: "unpaid",
      materialsSubtotal: new Prisma.Decimal("100.00"),
      platformCommission: new Prisma.Decimal("7.00"),
      supplierEarning: new Prisma.Decimal("93.00"),
      payload: { items: [] },
    },
  });
  const intent = await prisma.paymentIntent.create({
    data: {
      id: intentId,
      merchantReference: `EF-BK-${suffix}`.toUpperCase(),
      provider,
      kind: "MATERIAL_ORDER",
      userId: customer.id,
      materialOrderId: orderId,
      amount: new Prisma.Decimal("100.00"),
      commissionAmount: new Prisma.Decimal("7.00"),
      recipientAmount: new Prisma.Decimal("93.00"),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(),
      gatewayTransactionId: `gw-${suffix}`,
      gatewayPayload: gatewayPayload || undefined,
    },
  });
  return { customer, supplierUser, supplier, branch, profile, orderId, intentId, intent };
}

async function cleanup(fix) {
  if (!fix) return;
  await prisma.branchSettlementEvent.deleteMany({ where: { materialOrderId: fix.orderId } }).catch(() => {});
  await prisma.paymentIntent.deleteMany({ where: { id: fix.intentId } }).catch(() => {});
  await prisma.materialOrder.deleteMany({ where: { id: fix.orderId } }).catch(() => {});
  await prisma.branchWithdrawalProfile.deleteMany({ where: { branchId: fix.branch.id } }).catch(() => {});
  await prisma.branch.deleteMany({ where: { id: fix.branch.id } }).catch(() => {});
  await prisma.supplier.deleteMany({ where: { id: fix.supplier.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [fix.customer.id, fix.supplierUser.id] } } }).catch(() => {});
}

async function runSettlement(fix) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.materialOrder.update({
      where: { id: fix.orderId },
      data: { paymentStatus: "paid" },
    });
    return branchSettlementService.initiateSettlementAfterPayment(tx, fix.intent, order);
  });
}

async function testPendingVerificationPaysplitIsSettled() {
  const fetchCalls = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), method: String(opts.method || "GET") });
    throw new Error(`unexpected Paystack HTTP ${opts.method || "GET"} ${url}`);
  };
  const originalCreate = paystack.createSupplierSettlement;
  let createCalls = 0;
  paystack.createSupplierSettlement = async function wrapped(...args) {
    createCalls += 1;
    return originalCreate.apply(this, args);
  };
  const fix = await seedFixture(`${randomUUID().slice(0, 8)}ok`, {
    provider: "PAYSTACK",
    verificationStatus: "PENDING_VERIFICATION",
    recipientId: "ACCT_BRANCH",
    gatewayPayload: { subaccount: "ACCT_BRANCH", bearer: "subaccount" },
  });
  try {
    await withEnv(paystackEnv(), async () => {
      const result = await runSettlement(fix);
      assert.strictEqual(result.settlementStatus, "SETTLED");
      assert.strictEqual(createCalls, 1);
    });
    const order = await prisma.materialOrder.findUnique({ where: { id: fix.orderId } });
    assert.strictEqual(order.settlementStatus, "SETTLED");
    assert.strictEqual(Number(order.platformCommission), 7);
    assert.strictEqual(Number(order.supplierEarning), 93);
    const profile = await prisma.branchWithdrawalProfile.findUnique({ where: { id: fix.profile.id } });
    assert.strictEqual(profile.verificationStatus, "PENDING_VERIFICATION");
    assert.strictEqual(profile.gatewayProfileStatus, "PENDING");
    assert.ok(!fetchCalls.some((c) => String(c.url).includes("/transfer")));
    assert.strictEqual(fetchCalls.length, 0);
  } finally {
    paystack.createSupplierSettlement = originalCreate;
    global.fetch = previousFetch;
    await cleanup(fix);
  }
}

async function testSplitMismatchFailsClosed() {
  const fetchCalls = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), method: String(opts.method || "GET") });
    throw new Error(`unexpected Paystack HTTP ${opts.method || "GET"} ${url}`);
  };
  const fix = await seedFixture(`${randomUUID().slice(0, 8)}mm`, {
    provider: "PAYSTACK",
    verificationStatus: "PENDING_VERIFICATION",
    recipientId: "ACCT_BRANCH",
    gatewayPayload: { subaccount: "ACCT_OTHER", bearer: "subaccount" },
  });
  try {
    await withEnv(paystackEnv(), async () => {
      const result = await runSettlement(fix);
      assert.notStrictEqual(result.settlementStatus, "SETTLED");
      assert.strictEqual(result.settlementStatus, "FAILED");
    });
    const order = await prisma.materialOrder.findUnique({ where: { id: fix.orderId } });
    assert.notStrictEqual(order.settlementStatus, "SETTLED");
    const profile = await prisma.branchWithdrawalProfile.findUnique({ where: { id: fix.profile.id } });
    assert.strictEqual(profile.verificationStatus, "PENDING_VERIFICATION");
    assert.ok(!fetchCalls.some((c) => String(c.url).includes("/transfer")));
  } finally {
    global.fetch = previousFetch;
    await cleanup(fix);
  }
}

async function testPayfastIntentCannotUsePaystackBookkeeping() {
  const originalCreate = paystack.createSupplierSettlement;
  let createCalls = 0;
  paystack.createSupplierSettlement = async function wrapped(...args) {
    createCalls += 1;
    return originalCreate.apply(this, args);
  };
  const fix = await seedFixture(`${randomUUID().slice(0, 8)}pf`, {
    provider: "PAYFAST",
    verificationStatus: "PENDING_VERIFICATION",
    recipientId: "ACCT_BRANCH",
    gatewayPayload: { subaccount: "ACCT_BRANCH" },
  });
  try {
    await withEnv(paystackEnv(), async () => {
      const result = await runSettlement(fix);
      assert.notStrictEqual(result.settlementStatus, "SETTLED");
      assert.strictEqual(result.settlementStatus, "NOT_SUPPORTED");
      assert.strictEqual(createCalls, 0);
    });
  } finally {
    paystack.createSupplierSettlement = originalCreate;
    await cleanup(fix);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("paystack.settlement.bookkeeping.test.js: skip DB (DATABASE_URL not set)");
    return;
  }
  await testPendingVerificationPaysplitIsSettled();
  await testSplitMismatchFailsClosed();
  await testPayfastIntentCannotUsePaystackBookkeeping();
  console.log("paystack.settlement.bookkeeping.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");
runTestMain(main);
