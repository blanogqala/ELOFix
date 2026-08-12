/**
 * Branch settlement — events on payment, NOT_SUPPORTED path, webhook idempotency.
 * Run: node tests/branchSettlement.test.js
 */
require("dotenv").config();
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const branchSettlementService = require("../src/services/branchSettlement.service");

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const customer = await prisma.user.create({
    data: {
      email: `branch.settle.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const supplierUser = await prisma.user.create({
    data: {
      email: `branch.settle.sup.${suffix}@example.com`,
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
  const merchantReference = `EF-BSET-${suffix}`.toUpperCase();

  await prisma.materialOrder.create({
    data: {
      id: orderId,
      userId: customer.id,
      supplierId: supplier.id,
      branchId: branch.id,
      paymentStatus: "unpaid",
      materialsSubtotal: new Prisma.Decimal("100.00"),
      platformCommission: new Prisma.Decimal(0),
      supplierEarning: new Prisma.Decimal(0),
      payload: { items: [] },
    },
  });

  const intent = await prisma.paymentIntent.create({
    data: {
      id: intentId,
      merchantReference,
      provider: "PAYFAST",
      kind: "MATERIAL_ORDER",
      userId: customer.id,
      materialOrderId: orderId,
      amount: new Prisma.Decimal("100.00"),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(),
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.materialOrder.update({
        where: { id: orderId },
        data: {
          paymentStatus: "paid",
          platformCommission: new Prisma.Decimal("7.00"),
          supplierEarning: new Prisma.Decimal("93.00"),
        },
      });
      const result = await branchSettlementService.initiateSettlementAfterPayment(tx, intent, order);
      if (result.settlementStatus !== "NOT_SUPPORTED") {
        throw new Error(`expected NOT_SUPPORTED, got ${result.settlementStatus}`);
      }
    });

    const updatedOrder = await prisma.materialOrder.findUnique({ where: { id: orderId } });
    if (Number(updatedOrder.supplierEarning) !== 93) throw new Error("commission split wrong");
    if (updatedOrder.settlementStatus !== "NOT_SUPPORTED") {
      throw new Error("order settlementStatus must be NOT_SUPPORTED");
    }

    const events = await prisma.branchSettlementEvent.findMany({ where: { materialOrderId: orderId } });
    if (events.length < 3) throw new Error("expected payment, commission, and settlement events");

    const first = await branchSettlementService.applySettlementStatusUpdate({
      materialOrderId: orderId,
      paymentIntentId: intentId,
      settlementStatus: "SETTLED",
      gatewaySettlementId: `gw-settle-${suffix}`,
      gatewayReference: merchantReference,
      externalEventId: `evt-${suffix}-1`,
    });
    if (first.duplicate) throw new Error("first settlement update should not be duplicate");

    const second = await branchSettlementService.applySettlementStatusUpdate({
      materialOrderId: orderId,
      paymentIntentId: intentId,
      settlementStatus: "SETTLED",
      gatewaySettlementId: `gw-settle-${suffix}`,
      gatewayReference: merchantReference,
      externalEventId: `evt-${suffix}-1`,
    });

    const settledOrder = await prisma.materialOrder.findUnique({ where: { id: orderId } });
    if (settledOrder.settlementStatus !== "SETTLED") {
      throw new Error("order should be SETTLED after webhook");
    }

    const summary = await branchSettlementService.aggregateBranchSettlementSummary(branch.id, supplier.id);
    if (summary.settled <= 0 && settledOrder.settlementStatus === "SETTLED") {
      throw new Error("settled aggregate should reflect settled order");
    }

    console.log("branchSettlement.test.js: OK");
  } finally {
    await prisma.branchSettlementEvent.deleteMany({ where: { materialOrderId: orderId } });
    await prisma.paymentIntent.delete({ where: { id: intentId } }).catch(() => {});
    await prisma.materialOrder.delete({ where: { id: orderId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: branch.id } }).catch(() => {});
    await prisma.supplier.delete({ where: { id: supplier.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [customer.id, supplierUser.id] } } }).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
