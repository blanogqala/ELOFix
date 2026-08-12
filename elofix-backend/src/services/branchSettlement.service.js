const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const payoutDestinationService = require("./payoutDestination.service");

const SETTLED_STATUSES = new Set(["SETTLED"]);
const PENDING_STATUSES = new Set(["PENDING", "PROCESSING", "NOT_SUPPORTED", "FAILED"]);

function roundMoney2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function toAmountDecimal(amount) {
  return new Prisma.Decimal(String(Number(amount).toFixed(2)));
}

function gatewaySettlementSupported() {
  return payoutDestinationService.gatewaySettlementSupported();
}

function parseDateBound(value, endOfDay) {
  const s = String(value || "").trim();
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateFilter({ from, to } = {}) {
  const fromDate = parseDateBound(from, false);
  const toDate = parseDateBound(to, true);
  if (!fromDate && !toDate) return {};
  return {
    createdAt: {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    },
  };
}

function mapGatewaySettlementStatus(raw) {
  const s = String(raw || "").toUpperCase();
  if (s === "SETTLED" || s === "COMPLETE" || s === "COMPLETED") return "SETTLED";
  if (s === "PROCESSING" || s === "IN_PROGRESS") return "PROCESSING";
  if (s === "FAILED") return "FAILED";
  if (s === "REVERSED" || s === "REVERSED") return "REVERSED";
  return "PENDING";
}

function toPublicEvent(row, branchName) {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: branchName || undefined,
    supplierId: row.supplierId,
    materialOrderId: row.materialOrderId || undefined,
    paymentIntentId: row.paymentIntentId || undefined,
    eventType: row.eventType,
    grossAmount: roundMoney2(row.grossAmount),
    commissionAmount: roundMoney2(row.commissionAmount),
    netAmount: roundMoney2(row.netAmount),
    settlementStatus: row.settlementStatus,
    gatewayReference: row.gatewayReference || undefined,
    gatewaySettlementId: row.gatewaySettlementId || undefined,
    description: row.description || undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

async function createSettlementEventTx(tx, data) {
  return tx.branchSettlementEvent.create({
    data: {
      id: randomUUID(),
      branchId: String(data.branchId),
      supplierId: String(data.supplierId),
      materialOrderId: data.materialOrderId ? String(data.materialOrderId) : null,
      paymentIntentId: data.paymentIntentId ? String(data.paymentIntentId) : null,
      eventType: data.eventType,
      grossAmount: toAmountDecimal(data.grossAmount || 0),
      commissionAmount: toAmountDecimal(data.commissionAmount || 0),
      netAmount: toAmountDecimal(data.netAmount || 0),
      settlementStatus: data.settlementStatus || "NOT_APPLICABLE",
      gatewayReference: data.gatewayReference || null,
      gatewaySettlementId: data.gatewaySettlementId || null,
      description: data.description || null,
    },
  });
}

/**
 * Register branch bank profile with gateway when supported.
 */
async function registerBranchPayoutProfile(branchId) {
  return payoutDestinationService.registerPayoutDestination({ scope: "branch", entityId: branchId });
}

/**
 * After customer payment confirmed — record settlement intent and events.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function initiateSettlementAfterPayment(tx, intent, order) {
  const gross = roundMoney2(order.materialsSubtotal);
  const commission = roundMoney2(order.platformCommission);
  const net = roundMoney2(order.supplierEarning);
  const branchId = String(order.branchId);
  const supplierId = String(order.supplierId);

  await createSettlementEventTx(tx, {
    branchId,
    supplierId,
    materialOrderId: order.id,
    paymentIntentId: intent.id,
    eventType: "MATERIAL_PAYMENT",
    grossAmount: gross,
    commissionAmount: 0,
    netAmount: gross,
    settlementStatus: "NOT_APPLICABLE",
    gatewayReference: intent.merchantReference,
    description: "Customer material order payment confirmed",
  });

  await createSettlementEventTx(tx, {
    branchId,
    supplierId,
    materialOrderId: order.id,
    paymentIntentId: intent.id,
    eventType: "PLATFORM_COMMISSION",
    grossAmount: 0,
    commissionAmount: commission,
    netAmount: 0,
    settlementStatus: "NOT_APPLICABLE",
    description: "EloFix platform commission",
  });

  let settlementStatus = "NOT_SUPPORTED";
  let gatewaySettlementId = null;
  let failureReason = null;

  const destinationReady = await payoutDestinationService.assertSettlementDestinationReady({
    scope: "branch",
    entityId: branchId,
  });

  const { marketplaceSettlementEnabled, settlementCapableGateway } = require("./payments/paymentConfig");
  const gw = settlementCapableGateway();
  if (gw && marketplaceSettlementEnabled()) {
    if (!destinationReady.ready) {
      settlementStatus = destinationReady.reason?.includes("not verified") ? "ACTION_REQUIRED" : "PENDING";
      failureReason = destinationReady.reason || "Branch bank profile not ready for settlement";
    } else {
      const profile = destinationReady.profile;
      const settlementResult = await gw.createSupplierSettlement(intent, {
        recipientId: profile.gatewayRecipientId,
        branchId,
        netAmount: net,
      });
      if (settlementResult?.supported && settlementResult.settlementId) {
        gatewaySettlementId = settlementResult.settlementId;
        settlementStatus = mapGatewaySettlementStatus(settlementResult.status);
      } else if (settlementResult?.supported) {
        settlementStatus = "PENDING";
      } else {
        settlementStatus = "NOT_SUPPORTED";
        failureReason = settlementResult?.message || "Gateway settlement unavailable";
      }
    }
  } else {
    settlementStatus = "NOT_SUPPORTED";
    failureReason = "Automatic branch settlement is not available with the current payment gateway";
  }

  await tx.materialOrder.update({
    where: { id: order.id },
    data: {
      settlementStatus,
      settlementAmount: toAmountDecimal(net),
      gatewaySettlementId,
      settlementFailureReason: failureReason,
      ...(settlementStatus === "SETTLED" ? { settledAt: new Date() } : {}),
    },
  });

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: {
      branchId,
      branchSettlementStatus: settlementStatus,
      branchSettlementId: gatewaySettlementId,
      providerPayoutStatus: "NOT_APPLICABLE",
    },
  });

  const settlementEventType =
    settlementStatus === "SETTLED"
      ? "SETTLEMENT_COMPLETED"
      : settlementStatus === "FAILED"
        ? "SETTLEMENT_FAILED"
        : "SETTLEMENT_PENDING";

  await createSettlementEventTx(tx, {
    branchId,
    supplierId,
    materialOrderId: order.id,
    paymentIntentId: intent.id,
    eventType: settlementEventType,
    grossAmount: gross,
    commissionAmount: commission,
    netAmount: net,
    settlementStatus,
    gatewayReference: intent.merchantReference,
    gatewaySettlementId,
    description:
      settlementStatus === "SETTLED"
        ? "Branch settlement completed"
        : settlementStatus === "NOT_SUPPORTED"
          ? failureReason
          : "Branch settlement pending",
  });

  return { settlementStatus, gatewaySettlementId };
}

async function aggregateBranchSettlementSummary(branchId, supplierOrgId, { from, to } = {}) {
  const bid = String(branchId);
  const sid = String(supplierOrgId);

  const orders = await prisma.materialOrder.findMany({
    where: {
      branchId: bid,
      supplierId: sid,
      paymentStatus: "paid",
      ...dateFilter({ from, to }),
    },
    select: {
      materialsSubtotal: true,
      platformCommission: true,
      supplierEarning: true,
      settlementStatus: true,
      settlementAmount: true,
    },
  });

  let totalMaterialSales = 0;
  let platformCommission = 0;
  let netBranchEarnings = 0;
  let pendingSettlement = 0;
  let settled = 0;

  for (const o of orders) {
    totalMaterialSales += Number(o.materialsSubtotal || 0);
    platformCommission += Number(o.platformCommission || 0);
    const net = Number(o.supplierEarning || 0);
    netBranchEarnings += net;
    const st = String(o.settlementStatus || "NOT_APPLICABLE");
    if (SETTLED_STATUSES.has(st)) {
      settled += Number(o.settlementAmount || net);
    } else if (PENDING_STATUSES.has(st) || st === "NOT_APPLICABLE") {
      pendingSettlement += Number(o.settlementAmount || net);
    }
  }

  return {
    totalMaterialSales: roundMoney2(totalMaterialSales),
    platformCommission: roundMoney2(platformCommission),
    netBranchEarnings: roundMoney2(netBranchEarnings),
    pendingSettlement: roundMoney2(pendingSettlement),
    settled: roundMoney2(settled),
    gatewaySettlementSupported: gatewaySettlementSupported(),
  };
}

async function aggregateSupplierSettlementSummary(supplierOrgId, { from, to } = {}) {
  const sid = String(supplierOrgId || "").trim();
  if (!sid) return { totalPendingSettlement: 0, totalSettled: 0, byBranchId: {}, gatewaySettlementSupported: false };

  const branches = await prisma.branch.findMany({
    where: { supplierId: sid },
    select: { id: true },
  });

  const byBranchId = {};
  let totalPendingSettlement = 0;
  let totalSettled = 0;

  for (const b of branches) {
    const summary = await aggregateBranchSettlementSummary(b.id, sid, { from, to });
    byBranchId[b.id] = {
      pendingSettlement: summary.pendingSettlement,
      settled: summary.settled,
    };
    totalPendingSettlement = roundMoney2(totalPendingSettlement + summary.pendingSettlement);
    totalSettled = roundMoney2(totalSettled + summary.settled);
  }

  return {
    totalPendingSettlement,
    totalSettled,
    byBranchId,
    gatewaySettlementSupported: gatewaySettlementSupported(),
  };
}

async function listBranchSettlementHistory(branchId, { from, to } = {}) {
  const rows = await prisma.branchSettlementEvent.findMany({
    where: { branchId: String(branchId), ...dateFilter({ from, to }) },
    orderBy: { createdAt: "desc" },
  });
  return { events: rows.map((r) => toPublicEvent(r)) };
}

async function listSupplierSettlementHistory(supplierOrgId, { from, to, branchId } = {}) {
  const sid = String(supplierOrgId || "").trim();
  const bid = String(branchId || "").trim();
  const rows = await prisma.branchSettlementEvent.findMany({
    where: {
      supplierId: sid,
      ...(bid ? { branchId: bid } : {}),
      ...dateFilter({ from, to }),
    },
    orderBy: { createdAt: "desc" },
    include: { branch: { select: { id: true, name: true } } },
  });
  return {
    events: rows.map((r) => toPublicEvent(r, r.branch?.name)),
  };
}

async function applySettlementStatusUpdate({
  materialOrderId,
  paymentIntentId,
  settlementStatus,
  gatewaySettlementId,
  gatewayReference,
  externalEventId,
}) {
  const orderId = String(materialOrderId || "").trim();
  if (!orderId) throw new AppError("materialOrderId required for settlement update", 400);

  if (externalEventId) {
    const existing = await prisma.branchSettlementEvent.findFirst({
      where: {
        materialOrderId: orderId,
        eventType: "SETTLEMENT_COMPLETED",
        gatewaySettlementId: gatewaySettlementId || undefined,
        description: { contains: externalEventId },
      },
    });
    if (existing && settlementStatus === "SETTLED") {
      return { duplicate: true, orderId };
    }
  }

  const order = await prisma.materialOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Material order not found", 404);

  const st = mapGatewaySettlementStatus(settlementStatus);

  await prisma.$transaction(async (tx) => {
    await tx.materialOrder.update({
      where: { id: orderId },
      data: {
        settlementStatus: st,
        gatewaySettlementId: gatewaySettlementId || order.gatewaySettlementId,
        settledAt: st === "SETTLED" ? new Date() : order.settledAt,
        settlementFailureReason: st === "FAILED" ? "Settlement failed at gateway" : null,
      },
    });

    if (paymentIntentId) {
      await tx.paymentIntent.update({
        where: { id: String(paymentIntentId) },
        data: {
          branchSettlementStatus: st,
          branchSettlementId: gatewaySettlementId || undefined,
        },
      });
    }

    const eventType =
      st === "SETTLED"
        ? "SETTLEMENT_COMPLETED"
        : st === "FAILED"
          ? "SETTLEMENT_FAILED"
          : st === "REVERSED"
            ? "REVERSAL"
            : "SETTLEMENT_PENDING";

    await createSettlementEventTx(tx, {
      branchId: order.branchId,
      supplierId: order.supplierId,
      materialOrderId: order.id,
      paymentIntentId: paymentIntentId || null,
      eventType,
      grossAmount: order.materialsSubtotal,
      commissionAmount: order.platformCommission,
      netAmount: order.supplierEarning,
      settlementStatus: st,
      gatewayReference: gatewayReference || null,
      gatewaySettlementId: gatewaySettlementId || null,
      description: externalEventId ? `Webhook ${externalEventId}` : "Settlement status update",
    });
  });

  return { duplicate: false, orderId, settlementStatus: st };
}

async function handleSettlementWebhook(providerInput, payload, headers = {}) {
  const { getGateway, normalizeProvider } = require("./payments/gatewayRegistry");
  const provider = normalizeProvider(providerInput);
  if (!provider) throw new AppError("Invalid payment provider", 400);

  const gw = getGateway(provider);
  if (typeof gw.verifySettlementWebhook !== "function") {
    return { processed: false, reason: "settlement_webhooks_not_supported" };
  }

  const verified = await gw.verifySettlementWebhook(payload, headers);
  if (!verified?.valid) {
    return { processed: false, reason: "invalid_signature" };
  }

  const settlementId = verified.settlementId || verified.gatewayReference;
  if (!settlementId) {
    return { processed: false, reason: "missing_settlement_id" };
  }

  const intent = await prisma.paymentIntent.findFirst({
    where: {
      OR: [{ branchSettlementId: String(settlementId) }, { merchantReference: verified.gatewayReference }],
    },
    select: { id: true, materialOrderId: true },
  });

  if (!intent?.materialOrderId) {
    return { processed: false, reason: "order_not_found" };
  }

  const result = await applySettlementStatusUpdate({
    materialOrderId: intent.materialOrderId,
    paymentIntentId: intent.id,
    settlementStatus: verified.status,
    gatewaySettlementId: settlementId,
    gatewayReference: verified.gatewayReference,
    externalEventId: verified.externalEventId,
  });

  return { processed: true, ...result };
}

module.exports = {
  gatewaySettlementSupported,
  registerBranchPayoutProfile,
  initiateSettlementAfterPayment,
  aggregateBranchSettlementSummary,
  aggregateSupplierSettlementSummary,
  listBranchSettlementHistory,
  listSupplierSettlementHistory,
  applySettlementStatusUpdate,
  handleSettlementWebhook,
};
