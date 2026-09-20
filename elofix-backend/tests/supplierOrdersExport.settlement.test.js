/**
 * Supplier orders export settlementStatus mapping.
 * Run: node tests/supplierOrdersExport.settlement.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const materialOrderService = require("../src/services/materialOrder.service");

function dec(n) {
  return new Prisma.Decimal(String(Number(n).toFixed(2)));
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const paidAt = new Date("2026-09-15T12:00:00.000+02:00");
  const customer = await prisma.user.create({
    data: {
      email: `exp.set.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const supplierUser = await prisma.user.create({
    data: {
      email: `exp.set.own.${suffix}@example.com`,
      password: "x",
      name: "Supplier",
      role: "SUPPLIER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { userId: supplierUser.id, name: `Export Supplier ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: { id: randomUUID(), supplierId: supplier.id, name: `Branch ${suffix}`, products: [] },
  });

  async function seed({ tag, payoutStatus, orderSettlement, kind = "MATERIAL_ORDER" }) {
    const order = await prisma.materialOrder.create({
      data: {
        userId: customer.id,
        supplierId: supplier.id,
        branchId: branch.id,
        paymentStatus: "paid",
        fulfillmentStatus: "COMPLETED",
        materialsSubtotal: dec(50),
        platformCommission: dec(3.5),
        supplierEarning: dec(46.5),
        settlementStatus: orderSettlement,
        settlementAmount: dec(46.5),
        payload: { totalAmount: 50, items: [] },
        createdAt: paidAt,
      },
    });
    const intent = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-EXP-${tag}-${suffix}`.toUpperCase(),
        provider: "PAYSTACK",
        kind,
        paymentType: kind === "JOB_STORE_ORDER" ? "JOB_STORE_ORDER" : "MATERIAL_ORDER",
        userId: customer.id,
        materialOrderId: order.id,
        branchId: branch.id,
        amount: dec(50),
        commissionAmount: dec(3.5),
        recipientAmount: dec(46.5),
        currency: "ZAR",
        state: "PAID",
        paidAt,
        payoutSettlementStatus: payoutStatus,
      },
    });
    return { order, intent };
  }

  const created = [];
  try {
    const pending = await seed({ tag: "P", payoutStatus: "PENDING", orderSettlement: "PENDING" });
    const processing = await seed({ tag: "R", payoutStatus: "PROCESSING", orderSettlement: "PENDING" });
    const settled = await seed({ tag: "S", payoutStatus: "SETTLED", orderSettlement: "PENDING" });
    created.push(pending, processing, settled);

    const deliveryOnSettled = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-EXP-DEL-${suffix}`.toUpperCase(),
        provider: "PAYSTACK",
        kind: "DELIVERY_FEE",
        paymentType: "DELIVERY_FEE",
        userId: customer.id,
        materialOrderId: settled.order.id,
        branchId: branch.id,
        amount: dec(20),
        commissionAmount: dec(1.4),
        recipientAmount: dec(18.6),
        currency: "ZAR",
        state: "PAID",
        paidAt,
        payoutSettlementStatus: "PENDING",
      },
    });
    created.push({ order: settled.order, intent: deliveryOnSettled });

    const { rows } = await materialOrderService.buildSupplierOrdersExport(supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    const byId = new Map(rows.map((r) => [r.orderId, r]));

    assert.strictEqual(byId.get(pending.order.id).settlementStatus, "PENDING");
    assert.strictEqual(byId.get(pending.order.id).settlementRawStatus, "PENDING");
    assert.strictEqual(byId.get(processing.order.id).settlementStatus, "PROCESSING");
    assert.strictEqual(byId.get(processing.order.id).settlementRawStatus, "PROCESSING");
    assert.strictEqual(byId.get(settled.order.id).settlementStatus, "SUCCESS");
    assert.strictEqual(byId.get(settled.order.id).settlementRawStatus, "SETTLED");

    const fallbackOrder = await prisma.materialOrder.create({
      data: {
        userId: customer.id,
        supplierId: supplier.id,
        branchId: branch.id,
        paymentStatus: "paid",
        fulfillmentStatus: "COMPLETED",
        materialsSubtotal: dec(20),
        platformCommission: dec(1.4),
        supplierEarning: dec(18.6),
        settlementStatus: "SETTLED",
        settlementAmount: dec(18.6),
        payload: { totalAmount: 20, items: [] },
        createdAt: paidAt,
      },
    });
    created.push({ order: fallbackOrder, intent: { id: "none" } });

    const afterFallback = await materialOrderService.buildSupplierOrdersExport(supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    const fallbackRow = afterFallback.rows.find((r) => r.orderId === fallbackOrder.id);
    assert.ok(fallbackRow);
    assert.strictEqual(fallbackRow.settlementStatus, "SUCCESS");
    assert.strictEqual(fallbackRow.settlementRawStatus, "SETTLED");

    console.log("supplierOrdersExport.settlement.test.js: OK");
  } finally {
    const intentIds = created.map((c) => c.intent.id).filter((id) => id && id !== "none");
    const orderIds = [...new Set(created.map((c) => c.order.id))];
    await prisma.paymentIntent.deleteMany({ where: { id: { in: intentIds } } }).catch(() => {});
    await prisma.materialOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: branch.id } }).catch(() => {});
    await prisma.supplier.deleteMany({ where: { id: supplier.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [customer.id, supplierUser.id] } } }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
