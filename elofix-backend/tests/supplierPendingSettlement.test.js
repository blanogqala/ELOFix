/**
 * Pending Settlement = sum of paid supplier payouts not yet SETTLED.
 * Run: node tests/supplierPendingSettlement.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const branchSettlementService = require("../src/services/branchSettlement.service");

function dec(n) {
  return new Prisma.Decimal(String(Number(n).toFixed(2)));
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const paidAt = new Date("2026-09-15T12:00:00.000+02:00");
  const customer = await prisma.user.create({
    data: {
      email: `pend.set.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const supplierUser = await prisma.user.create({
    data: {
      email: `pend.set.own.${suffix}@example.com`,
      password: "x",
      name: "Supplier",
      role: "SUPPLIER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { userId: supplierUser.id, name: `Pending Supplier ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: { id: randomUUID(), supplierId: supplier.id, name: `Branch ${suffix}`, products: [] },
  });

  const fromTo = { from: "2026-09-15", to: "2026-09-15" };

  async function seedPaidOrder({ name, earning, settlementStatus, payoutStatus, expectedBank, recipient }) {
    const order = await prisma.materialOrder.create({
      data: {
        userId: customer.id,
        supplierId: supplier.id,
        branchId: branch.id,
        paymentStatus: "paid",
        materialsSubtotal: dec(recipient),
        platformCommission: dec(0),
        supplierEarning: dec(earning),
        settlementStatus,
        settlementAmount: dec(earning),
        payload: { totalAmount: recipient, seed: name },
        createdAt: paidAt,
      },
    });
    const intent = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-PEND-${name}-${suffix}`.toUpperCase(),
        provider: "PAYSTACK",
        kind: "MATERIAL_ORDER",
        paymentType: "MATERIAL_ORDER",
        userId: customer.id,
        materialOrderId: order.id,
        branchId: branch.id,
        amount: dec(recipient),
        commissionAmount: dec(0),
        recipientAmount: dec(recipient),
        ...(expectedBank != null ? { expectedBankSettlementAmount: dec(expectedBank) } : {}),
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
    const pending = await seedPaidOrder({
      name: "A",
      earning: 46.5,
      settlementStatus: "PENDING",
      payoutStatus: "PENDING",
      expectedBank: 43.68,
      recipient: 46.5,
    });
    created.push(pending);

    let summary = await branchSettlementService.aggregateBranchSettlementSummary(branch.id, supplier.id, fromTo);
    assert.strictEqual(summary.pendingSettlement, 43.68, "A: PENDING payout stays in pending");

    const processing = await seedPaidOrder({
      name: "B",
      earning: 300,
      settlementStatus: "PROCESSING",
      payoutStatus: "PROCESSING",
      expectedBank: 279,
      recipient: 300,
    });
    created.push(processing);

    summary = await branchSettlementService.aggregateBranchSettlementSummary(branch.id, supplier.id, fromTo);
    assert.strictEqual(summary.pendingSettlement, 322.68, "B: PROCESSING payout stays in pending");

    const settled = await seedPaidOrder({
      name: "C",
      earning: 1000,
      settlementStatus: "SETTLED",
      payoutStatus: "SETTLED",
      expectedBank: 930,
      recipient: 1000,
    });
    created.push(settled);

    summary = await branchSettlementService.aggregateBranchSettlementSummary(branch.id, supplier.id, fromTo);
    assert.strictEqual(summary.pendingSettlement, 322.68, "D: SETTLED excluded; pending is 43.68 + 279");
    assert.strictEqual(summary.settled, 930);

    const org = await branchSettlementService.aggregateSupplierSettlementSummary(supplier.id, fromTo);
    assert.strictEqual(org.totalPendingSettlement, 322.68);
    assert.strictEqual(org.totalSettled, 930);

    await prisma.paymentIntent.update({
      where: { id: pending.intent.id },
      data: { expectedBankSettlementAmount: null, processorFeeAmount: null },
    });
    const fallback = await branchSettlementService.aggregateBranchSettlementSummary(branch.id, supplier.id, fromTo);
    assert.strictEqual(fallback.pendingSettlement, 325.5, "E: missing expected bank uses recipientAmount 46.5 + 279");
    assert.strictEqual(fallback.pendingUsesGrossFallback, true);

    const duplicateJobStore = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-PEND-DUP-${suffix}`.toUpperCase(),
        provider: "PAYSTACK",
        kind: "JOB_STORE_ORDER",
        paymentType: "JOB_STORE_ORDER",
        userId: customer.id,
        materialOrderId: processing.order.id,
        branchId: branch.id,
        amount: dec(300),
        commissionAmount: dec(0),
        recipientAmount: dec(300),
        expectedBankSettlementAmount: dec(279),
        currency: "ZAR",
        state: "PAID",
        paidAt,
        payoutSettlementStatus: "PROCESSING",
      },
    });
    created.push({ order: processing.order, intent: duplicateJobStore });

    const deduped = await branchSettlementService.aggregateBranchSettlementSummary(branch.id, supplier.id, fromTo);
    assert.strictEqual(
      deduped.pendingSettlement,
      325.5,
      "G: MATERIAL_ORDER + JOB_STORE_ORDER for one order counted once"
    );

    console.log("supplierPendingSettlement.test.js: OK");
  } finally {
    const intentIds = created.map((c) => c.intent.id);
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
