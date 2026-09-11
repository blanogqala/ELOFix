/**
 * Settlement after payment must use PaymentIntent.provider, not the global
 * settlementCapableGateway(). Run: node tests/paystack.settlementGatewayBind.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
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

async function seedMaterialFixture(suffix, provider) {
  const customer = await prisma.user.create({
    data: {
      email: `bind.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const supplierUser = await prisma.user.create({
    data: {
      email: `bind.sup.${suffix}@example.com`,
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
  const orderId = randomUUID();
  const intentId = randomUUID();
  const merchantReference = `EF-BIND-${suffix}`.toUpperCase();
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
      merchantReference,
      provider,
      kind: "MATERIAL_ORDER",
      userId: customer.id,
      materialOrderId: orderId,
      amount: new Prisma.Decimal("100.00"),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(),
      gatewayTransactionId: `gw-${suffix}`,
    },
  });
  return { customer, supplier, branch, orderId, intentId, intent };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("paystack.settlementGatewayBind.test.js: skip DB (DATABASE_URL not set)");
    return;
  }

  const paystackCalls = [];
  const originalCreateSupplierSettlement = paystack.createSupplierSettlement;
  paystack.createSupplierSettlement = async function wrappedCreateSupplierSettlement(...args) {
    paystackCalls.push(args);
    return originalCreateSupplierSettlement.apply(this, args);
  };

  const fetchCalls = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), method: String(opts.method || "GET") });
    throw new Error(`unexpected Paystack HTTP ${opts.method || "GET"} ${url}`);
  };

  const created = [];
  try {
    await withEnv(
      {
        MARKETPLACE_SETTLEMENT_ENABLED: "true",
        ENABLED_PAYMENT_PROVIDERS: "payfast,paystack",
        PAYSTACK_MODE: "test",
        PAYSTACK_SECRET_KEY: "sk_test_unit_not_a_real_key",
        PAYSTACK_PUBLIC_KEY: "pk_test_unit_not_a_real_key",
      },
      async () => {
        const payfastFix = await seedMaterialFixture(`${randomUUID().slice(0, 8)}pf`, "PAYFAST");
        created.push(payfastFix);
        paystackCalls.length = 0;
        await prisma.$transaction(async (tx) => {
          const order = await tx.materialOrder.update({
            where: { id: payfastFix.orderId },
            data: { paymentStatus: "paid" },
          });
          const result = await branchSettlementService.initiateSettlementAfterPayment(
            tx,
            payfastFix.intent,
            order
          );
          if (result.settlementStatus === "SETTLED") {
            throw new Error("PAYFAST intent must not be marked SETTLED via Paystack");
          }
          if (result.settlementStatus !== "NOT_SUPPORTED") {
            throw new Error(`expected NOT_SUPPORTED for PAYFAST, got ${result.settlementStatus}`);
          }
        });
        if (paystackCalls.length !== 0) {
          throw new Error("PAYFAST intent must not call Paystack createSupplierSettlement");
        }

        const paystackFix = await seedMaterialFixture(`${randomUUID().slice(0, 8)}ps`, "PAYSTACK");
        created.push(paystackFix);
        await prisma.branchWithdrawalProfile.create({
          data: {
            id: randomUUID(),
            branchId: paystackFix.branch.id,
            bankName: "FNB",
            accountNumber: "enc:test",
            accountHolder: "Branch Holder",
            branchCode: "enc:test",
            verificationStatus: "VERIFIED",
            gatewayProvider: "PAYSTACK",
            gatewayRecipientId: "ACCT_BRANCH",
            gatewayProfileStatus: "VERIFIED",
            isActive: true,
          },
        });
        paystackCalls.length = 0;
        fetchCalls.length = 0;
        await prisma.$transaction(async (tx) => {
          const order = await tx.materialOrder.update({
            where: { id: paystackFix.orderId },
            data: { paymentStatus: "paid" },
          });
          const result = await branchSettlementService.initiateSettlementAfterPayment(
            tx,
            paystackFix.intent,
            order
          );
          if (result.settlementStatus !== "SETTLED") {
            throw new Error(`expected SETTLED for PAYSTACK split, got ${result.settlementStatus}`);
          }
          if (paystackCalls.length !== 1) {
            throw new Error("PAYSTACK intent must use Paystack createSupplierSettlement once");
          }
        });
        if (fetchCalls.some((c) => String(c.url).includes("/transfer"))) {
          throw new Error("PAYSTACK settlement must not issue a transfer HTTP call");
        }
        if (fetchCalls.length !== 0) {
          throw new Error("PAYSTACK already-split settlement must not call Paystack HTTP");
        }
      }
    );
    console.log("paystack.settlementGatewayBind.test.js: all passed");
  } finally {
    paystack.createSupplierSettlement = originalCreateSupplierSettlement;
    global.fetch = previousFetch;
    for (const row of created.reverse()) {
      await prisma.branchSettlementEvent.deleteMany({ where: { materialOrderId: row.orderId } }).catch(() => {});
      await prisma.paymentIntent.deleteMany({ where: { id: row.intentId } }).catch(() => {});
      await prisma.materialOrder.deleteMany({ where: { id: row.orderId } }).catch(() => {});
      await prisma.branchWithdrawalProfile.deleteMany({ where: { branchId: row.branch.id } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { id: row.branch.id } }).catch(() => {});
      await prisma.supplier.deleteMany({ where: { id: row.supplier.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: [row.customer.id, row.supplier.userId] } } }).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
