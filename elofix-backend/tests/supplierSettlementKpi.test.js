/**
 * Supplier settlement KPIs — D3 PaymentIntent source of truth, isolation, date basis.
 * Run: node tests/supplierSettlementKpi.test.js
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
  const paidSep15 = new Date("2026-09-15T12:00:00.000+02:00");
  const customer = await prisma.user.create({
    data: {
      email: `sup.kpi.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `sup.kpi.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const supplierUser = await prisma.user.create({
    data: {
      email: `sup.kpi.own.${suffix}@example.com`,
      password: "x",
      name: "Supplier",
      role: "SUPPLIER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { userId: supplierUser.id, name: `KPI Supplier ${suffix}` },
  });
  const branchA = await prisma.branch.create({
    data: { id: randomUUID(), supplierId: supplier.id, name: `Branch A ${suffix}`, products: [] },
  });
  const branchB = await prisma.branch.create({
    data: { id: randomUUID(), supplierId: supplier.id, name: `Branch B ${suffix}`, products: [] },
  });
  const job = await prisma.job.create({
    data: {
      id: randomUUID(),
      title: "Labor",
      customerId: customer.id,
      providerId: providerUser.id,
      category: "tiling",
      description: "test",
      status: "ACCEPTED",
      price: dec(50),
      measurements: {},
      materials: [],
      images: [],
    },
  });

  const orderA = await prisma.materialOrder.create({
    data: {
      userId: customer.id,
      supplierId: supplier.id,
      branchId: branchA.id,
      paymentStatus: "paid",
      materialsSubtotal: dec(50),
      platformCommission: dec(3.5),
      supplierEarning: dec(46.5),
      settlementStatus: "PENDING",
      settlementAmount: dec(46.5),
      payload: { totalAmount: 50 },
      createdAt: paidSep15,
    },
  });
  const orderB = await prisma.materialOrder.create({
    data: {
      userId: customer.id,
      supplierId: supplier.id,
      branchId: branchB.id,
      paymentStatus: "paid",
      materialsSubtotal: dec(80),
      platformCommission: dec(5.6),
      supplierEarning: dec(74.4),
      settlementStatus: "SETTLED",
      settlementAmount: dec(74.4),
      payload: { totalAmount: 80 },
      createdAt: paidSep15,
    },
  });
  const legacyOrder = await prisma.materialOrder.create({
    data: {
      userId: customer.id,
      supplierId: supplier.id,
      branchId: branchA.id,
      paymentStatus: "paid",
      materialsSubtotal: dec(20),
      platformCommission: dec(1.4),
      supplierEarning: dec(18.6),
      settlementStatus: "SETTLED",
      settlementAmount: dec(18.6),
      payload: { totalAmount: 20 },
      createdAt: paidSep15,
    },
  });

  const intentProcessingUnknownFee = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-KPI-P1-${suffix}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "MATERIAL_ORDER",
      paymentType: "MATERIAL_ORDER",
      userId: customer.id,
      materialOrderId: orderA.id,
      branchId: branchA.id,
      amount: dec(50),
      commissionAmount: dec(3.5),
      recipientAmount: dec(46.5),
      currency: "ZAR",
      state: "PAID",
      paidAt: paidSep15,
      payoutSettlementStatus: "PROCESSING",
    },
  });

  const laborIntent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-KPI-LAB-${suffix}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "LABOR",
      paymentType: "DEPOSIT",
      userId: customer.id,
      jobId: job.id,
      recipientUserId: providerUser.id,
      amount: dec(50),
      commissionAmount: dec(3.5),
      recipientAmount: dec(46.5),
      expectedBankSettlementAmount: dec(43.68),
      processorFeeAmount: dec(2.82),
      currency: "ZAR",
      state: "PAID",
      paidAt: paidSep15,
      payoutSettlementStatus: "SETTLED",
    },
  });

  const intentB = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-KPI-B-${suffix}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "MATERIAL_ORDER",
      paymentType: "MATERIAL_ORDER",
      userId: customer.id,
      materialOrderId: orderB.id,
      branchId: branchB.id,
      amount: dec(80),
      commissionAmount: dec(5.6),
      recipientAmount: dec(74.4),
      expectedBankSettlementAmount: dec(70),
      processorFeeAmount: dec(4.4),
      currency: "ZAR",
      state: "PAID",
      paidAt: paidSep15,
      payoutSettlementStatus: "SETTLED",
    },
  });

  try {
    const aUnknown = await branchSettlementService.aggregateBranchSettlementSummary(branchA.id, supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    assert.strictEqual(aUnknown.pendingSettlement, 46.5);
    assert.strictEqual(aUnknown.settled, 18.6);
    assert.strictEqual(aUnknown.pendingUsesGrossFallback, true);
    assert.strictEqual(aUnknown.settlementKpiDateBasis, "paymentIntent.paidAt_or_createdAt");

    await prisma.paymentIntent.update({
      where: { id: intentProcessingUnknownFee.id },
      data: { expectedBankSettlementAmount: dec(43.68), processorFeeAmount: dec(2.82) },
    });
    const aPendingBank = await branchSettlementService.aggregateBranchSettlementSummary(branchA.id, supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    assert.strictEqual(aPendingBank.pendingSettlement, 43.68);
    assert.strictEqual(aPendingBank.pendingUsesGrossFallback, false);

    await prisma.paymentIntent.update({
      where: { id: intentProcessingUnknownFee.id },
      data: { payoutSettlementStatus: "SETTLED" },
    });
    const aSettled = await branchSettlementService.aggregateBranchSettlementSummary(branchA.id, supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    assert.strictEqual(aSettled.pendingSettlement, 0);
    assert.strictEqual(aSettled.settled, 62.28);

    const aSep16 = await branchSettlementService.aggregateBranchSettlementSummary(branchA.id, supplier.id, {
      from: "2026-09-16",
      to: "2026-09-16",
    });
    assert.strictEqual(aSep16.pendingSettlement, 0);
    assert.strictEqual(aSep16.settled, 0);

    const supplierAll = await branchSettlementService.aggregateSupplierSettlementSummary(supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    assert.strictEqual(supplierAll.byBranchId[branchA.id].settled, 62.28);
    assert.strictEqual(supplierAll.byBranchId[branchB.id].settled, 70);
    assert.strictEqual(supplierAll.totalSettled, 132.28);
    assert.ok(!supplierAll.byBranchId[branchA.id].settled || supplierAll.byBranchId[branchA.id].settled !== 70);

    const bOnly = await branchSettlementService.aggregateBranchSettlementSummary(branchB.id, supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    assert.strictEqual(bOnly.settled, 70);
    assert.strictEqual(bOnly.pendingSettlement, 0);

    await prisma.paymentIntent.update({
      where: { id: intentProcessingUnknownFee.id },
      data: { payoutSettlementStatus: "FAILED" },
    });
    const aFailed = await branchSettlementService.aggregateBranchSettlementSummary(branchA.id, supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    assert.strictEqual(aFailed.pendingSettlement, 0);
    assert.ok(aFailed.needsAttentionAmount >= 43.68);
    assert.ok(aFailed.needsAttentionCount >= 1);

    const laborFresh = await prisma.paymentIntent.findUnique({ where: { id: laborIntent.id } });
    assert.strictEqual(Number(laborFresh.recipientAmount), 46.5);
    assert.strictEqual(aFailed.pendingSettlement, 0);

    const legacyOnly = await branchSettlementService.aggregateBranchSettlementSummary(branchA.id, supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    assert.strictEqual(legacyOnly.settled, 18.6);

    await prisma.paymentIntent.update({
      where: { id: intentProcessingUnknownFee.id },
      data: { payoutSettlementStatus: "PROCESSING" },
    });
    await prisma.materialOrder.update({
      where: { id: orderA.id },
      data: { settlementStatus: "SETTLED", settlementAmount: dec(46.5) },
    });
    const d3Wins = await branchSettlementService.aggregateBranchSettlementSummary(branchA.id, supplier.id, {
      from: "2026-09-15",
      to: "2026-09-15",
    });
    assert.strictEqual(d3Wins.pendingSettlement, 43.68);
    assert.strictEqual(d3Wins.settled, 18.6);

    console.log("supplierSettlementKpi.test.js: OK");
  } finally {
    await prisma.paymentIntent.deleteMany({
      where: { id: { in: [intentProcessingUnknownFee.id, laborIntent.id, intentB.id] } },
    }).catch(() => {});
    await prisma.materialOrder.deleteMany({
      where: { id: { in: [orderA.id, orderB.id, legacyOrder.id] } },
    }).catch(() => {});
    await prisma.job.deleteMany({ where: { id: job.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } }).catch(() => {});
    await prisma.supplier.deleteMany({ where: { id: supplier.id } }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: [customer.id, providerUser.id, supplierUser.id] } },
    }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
