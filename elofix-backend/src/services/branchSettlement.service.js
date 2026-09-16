const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const payoutDestinationService = require("./payoutDestination.service");

const SETTLED_STATUSES = new Set(["SETTLED"]);
const PENDING_PAYOUT_STATUSES = new Set(["PENDING", "PROCESSING"]);
const AUTHORITATIVE_D3_PAYOUT_STATUSES = new Set([
  "PENDING",
  "PROCESSING",
  "SETTLED",
  "FAILED",
  "REVERSED",
]);
const ATTENTION_PAYOUT_STATUSES = new Set(["FAILED", "REVERSED", "NOT_SUPPORTED", "NOT_APPLICABLE"]);
const SUPPLIER_RECIPIENT_KINDS = new Set(["MATERIAL_ORDER", "JOB_STORE_ORDER", "DELIVERY_FEE"]);
/** Settlement KPI date range uses PaymentIntent.paidAt (fallback createdAt), not Paystack settlement_date. */
const SETTLEMENT_KPI_DATE_BASIS = "paymentIntent.paidAt_or_createdAt";

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

function paidAtOrCreatedAtFilter({ from, to } = {}) {
  const fromDate = parseDateBound(from, false);
  const toDate = parseDateBound(to, true);
  if (!fromDate && !toDate) return {};
  const range = {
    ...(fromDate ? { gte: fromDate } : {}),
    ...(toDate ? { lte: toDate } : {}),
  };
  return {
    OR: [{ paidAt: range }, { AND: [{ paidAt: null }, { createdAt: range }] }],
  };
}

function emptySettlementSummary() {
  return {
    totalMaterialSales: 0,
    platformCommission: 0,
    netBranchEarnings: 0,
    pendingSettlement: 0,
    settled: 0,
    needsAttentionAmount: 0,
    needsAttentionCount: 0,
    pendingUsesGrossFallback: false,
    settlementKpiDateBasis: SETTLEMENT_KPI_DATE_BASIS,
    gatewaySettlementSupported: gatewaySettlementSupported(),
  };
}

function payoutBucketAmount(intent) {
  if (intent?.expectedBankSettlementAmount != null && Number.isFinite(Number(intent.expectedBankSettlementAmount))) {
    return { amount: roundMoney2(intent.expectedBankSettlementAmount), usesGrossFallback: false };
  }
  return { amount: roundMoney2(intent?.recipientAmount || 0), usesGrossFallback: true };
}

function isStoreDeliveryToBranch(intent, order) {
  if (String(intent?.kind || "").toUpperCase() !== "DELIVERY_FEE") return false;
  const payload = order?.payload && typeof order.payload === "object" ? order.payload : {};
  return String(payload.deliveryType || "").toUpperCase() === "STORE_DELIVERY";
}

function isSupplierBranchRecipientIntent(intent, order, branchId, supplierOrgId) {
  const kind = String(intent?.kind || "").toUpperCase();
  if (!SUPPLIER_RECIPIENT_KINDS.has(kind)) return false;
  if (kind === "LABOR" || kind === "PROVIDER_REFUND_REPAYMENT") return false;
  const bid = String(branchId);
  const sid = String(supplierOrgId);
  const intentBranch = String(intent?.branchId || order?.branchId || "");
  if (intentBranch !== bid) return false;
  if (order?.supplierId && String(order.supplierId) !== sid) return false;
  if (kind === "DELIVERY_FEE") return isStoreDeliveryToBranch(intent, order);
  return kind === "MATERIAL_ORDER" || kind === "JOB_STORE_ORDER";
}

function mapGatewaySettlementStatus(raw) {
  const s = String(raw || "").toUpperCase();
  if (s === "SETTLED") return "SETTLED";
  if (s === "COMPLETE" || s === "COMPLETED") return "PROCESSING";
  if (s === "PROCESSING" || s === "IN_PROGRESS") return "PROCESSING";
  if (s === "FAILED") return "FAILED";
  if (s === "REVERSED") return "REVERSED";
  return "PENDING";
}

function toPublicEvent(row, branchName) {
  const intent = row.paymentIntent;
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
    settlementStatus: intent?.payoutSettlementStatus || row.settlementStatus,
    payoutSettlementStatus: intent?.payoutSettlementStatus || row.settlementStatus,
    processorFeeAmount:
      intent?.processorFeeAmount != null && Number.isFinite(Number(intent.processorFeeAmount))
        ? roundMoney2(intent.processorFeeAmount)
        : null,
    expectedBankSettlementAmount:
      intent?.expectedBankSettlementAmount != null &&
      Number.isFinite(Number(intent.expectedBankSettlementAmount))
        ? roundMoney2(intent.expectedBankSettlementAmount)
        : null,
    gatewayReference: row.gatewayReference || undefined,
    gatewaySettlementId:
      intent?.payoutSettlement?.externalSettlementId || row.gatewaySettlementId || undefined,
    description: row.description || undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

const payoutIntentInclude = {
  paymentIntent: {
    select: {
      processorFeeAmount: true,
      expectedBankSettlementAmount: true,
      payoutSettlementStatus: true,
      payoutSettlement: { select: { externalSettlementId: true } },
    },
  },
};

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

  const { marketplaceSettlementEnabled, settlementGatewayForIntent } = require("./payments/paymentConfig");
  const { normalizeProvider } = require("./payments/gatewayRegistry");
  const gw = settlementGatewayForIntent(intent);
  if (gw && marketplaceSettlementEnabled()) {
    const paystackIntent = normalizeProvider(intent?.provider) === "PAYSTACK";
    const destinationReady = paystackIntent
      ? await payoutDestinationService.assertPaystackSplitBookkeepingReady({
          scope: "branch",
          entityId: branchId,
          intent,
        })
      : await payoutDestinationService.assertSettlementDestinationReady({
          scope: "branch",
          entityId: branchId,
        });
    if (!destinationReady.ready) {
      if (destinationReady.contradiction) {
        settlementStatus = "FAILED";
        failureReason = destinationReady.reason || "Paystack split recipient mismatch";
      } else {
        settlementStatus = destinationReady.reason?.includes("not verified") ? "ACTION_REQUIRED" : "PENDING";
        failureReason = destinationReady.reason || "Branch bank profile not ready for settlement";
      }
    } else {
      const profile = destinationReady.profile;
      const settlementResult = await gw.createSupplierSettlement(intent, {
        recipientId: profile.gatewayRecipientId,
        branchId,
        netAmount: net,
      });
      if (settlementResult?.message === "subaccount_mismatch") {
        settlementStatus = "FAILED";
        failureReason = "Paystack split recipient mismatch";
      } else if (settlementResult?.supported && settlementResult.settlementId) {
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
  const owned = await prisma.branch.findFirst({
    where: { id: bid, supplierId: sid },
    select: { id: true },
  });
  if (!owned) return emptySettlementSummary();

  const orders = await prisma.materialOrder.findMany({
    where: {
      branchId: bid,
      supplierId: sid,
      paymentStatus: "paid",
      ...dateFilter({ from, to }),
    },
    select: {
      id: true,
      materialsSubtotal: true,
      platformCommission: true,
      supplierEarning: true,
      settlementStatus: true,
      settlementAmount: true,
    },
  });

  const dateWhere = paidAtOrCreatedAtFilter({ from, to });
  const intents = await prisma.paymentIntent.findMany({
    where: {
      state: "PAID",
      kind: { in: ["MATERIAL_ORDER", "JOB_STORE_ORDER", "DELIVERY_FEE"] },
      AND: [
        {
          OR: [{ branchId: bid }, { materialOrder: { is: { branchId: bid, supplierId: sid } } }],
        },
        ...(Object.keys(dateWhere).length ? [dateWhere] : []),
      ],
    },
    select: {
      id: true,
      kind: true,
      branchId: true,
      materialOrderId: true,
      recipientAmount: true,
      expectedBankSettlementAmount: true,
      payoutSettlementStatus: true,
      paidAt: true,
      createdAt: true,
      materialOrder: {
        select: {
          id: true,
          supplierId: true,
          branchId: true,
          payload: true,
        },
      },
    },
  });

  let totalMaterialSales = 0;
  let platformCommission = 0;
  let netBranchEarnings = 0;
  for (const o of orders) {
    totalMaterialSales += Number(o.materialsSubtotal || 0);
    platformCommission += Number(o.platformCommission || 0);
    netBranchEarnings += Number(o.supplierEarning || 0);
  }

  let pendingSettlement = 0;
  let settled = 0;
  let needsAttentionAmount = 0;
  let needsAttentionCount = 0;
  let pendingUsesGrossFallback = false;
  const d3CoveredOrderIds = new Set();

  for (const intent of intents) {
    if (!isSupplierBranchRecipientIntent(intent, intent.materialOrder, bid, sid)) continue;
    const payoutStatus = String(intent.payoutSettlementStatus || "NOT_APPLICABLE").toUpperCase();
    if (
      (intent.kind === "MATERIAL_ORDER" || intent.kind === "JOB_STORE_ORDER") &&
      intent.materialOrderId &&
      AUTHORITATIVE_D3_PAYOUT_STATUSES.has(payoutStatus)
    ) {
      d3CoveredOrderIds.add(String(intent.materialOrderId));
    }
    if (!AUTHORITATIVE_D3_PAYOUT_STATUSES.has(payoutStatus)) continue;
    const bucket = payoutBucketAmount(intent);
    if (PENDING_PAYOUT_STATUSES.has(payoutStatus)) {
      pendingSettlement += bucket.amount;
      if (bucket.usesGrossFallback) pendingUsesGrossFallback = true;
    } else if (SETTLED_STATUSES.has(payoutStatus)) {
      settled += bucket.amount;
    } else if (ATTENTION_PAYOUT_STATUSES.has(payoutStatus)) {
      needsAttentionAmount += bucket.amount;
      needsAttentionCount += 1;
    }
  }

  for (const o of orders) {
    if (d3CoveredOrderIds.has(String(o.id))) continue;
    const st = String(o.settlementStatus || "NOT_APPLICABLE").toUpperCase();
    const net = Number(o.settlementAmount != null ? o.settlementAmount : o.supplierEarning || 0);
    if (SETTLED_STATUSES.has(st)) {
      settled += net;
    } else if (PENDING_PAYOUT_STATUSES.has(st)) {
      pendingSettlement += net;
      pendingUsesGrossFallback = true;
    } else if (ATTENTION_PAYOUT_STATUSES.has(st) || st === "ACTION_REQUIRED") {
      needsAttentionAmount += net;
      needsAttentionCount += 1;
    }
  }

  return {
    totalMaterialSales: roundMoney2(totalMaterialSales),
    platformCommission: roundMoney2(platformCommission),
    netBranchEarnings: roundMoney2(netBranchEarnings),
    pendingSettlement: roundMoney2(pendingSettlement),
    settled: roundMoney2(settled),
    needsAttentionAmount: roundMoney2(needsAttentionAmount),
    needsAttentionCount,
    pendingUsesGrossFallback,
    settlementKpiDateBasis: SETTLEMENT_KPI_DATE_BASIS,
    gatewaySettlementSupported: gatewaySettlementSupported(),
  };
}

async function aggregateSupplierSettlementSummary(supplierOrgId, { from, to } = {}) {
  const sid = String(supplierOrgId || "").trim();
  if (!sid) {
    return {
      totalPendingSettlement: 0,
      totalSettled: 0,
      totalNeedsAttentionAmount: 0,
      totalNeedsAttentionCount: 0,
      pendingUsesGrossFallback: false,
      settlementKpiDateBasis: SETTLEMENT_KPI_DATE_BASIS,
      byBranchId: {},
      gatewaySettlementSupported: false,
    };
  }

  const branches = await prisma.branch.findMany({
    where: { supplierId: sid },
    select: { id: true },
  });

  const byBranchId = {};
  let totalPendingSettlement = 0;
  let totalSettled = 0;
  let totalNeedsAttentionAmount = 0;
  let totalNeedsAttentionCount = 0;
  let pendingUsesGrossFallback = false;

  for (const b of branches) {
    const summary = await aggregateBranchSettlementSummary(b.id, sid, { from, to });
    byBranchId[b.id] = {
      pendingSettlement: summary.pendingSettlement,
      settled: summary.settled,
      needsAttentionAmount: summary.needsAttentionAmount,
      needsAttentionCount: summary.needsAttentionCount,
      pendingUsesGrossFallback: summary.pendingUsesGrossFallback,
    };
    totalPendingSettlement = roundMoney2(totalPendingSettlement + summary.pendingSettlement);
    totalSettled = roundMoney2(totalSettled + summary.settled);
    totalNeedsAttentionAmount = roundMoney2(totalNeedsAttentionAmount + summary.needsAttentionAmount);
    totalNeedsAttentionCount += summary.needsAttentionCount;
    if (summary.pendingUsesGrossFallback) pendingUsesGrossFallback = true;
  }

  return {
    totalPendingSettlement,
    totalSettled,
    totalNeedsAttentionAmount,
    totalNeedsAttentionCount,
    pendingUsesGrossFallback,
    settlementKpiDateBasis: SETTLEMENT_KPI_DATE_BASIS,
    byBranchId,
    gatewaySettlementSupported: gatewaySettlementSupported(),
  };
}

async function listBranchSettlementHistory(branchId, { from, to } = {}) {
  const rows = await prisma.branchSettlementEvent.findMany({
    where: { branchId: String(branchId), ...dateFilter({ from, to }) },
    orderBy: { createdAt: "desc" },
    include: payoutIntentInclude,
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
    include: { branch: { select: { id: true, name: true } }, ...payoutIntentInclude },
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
    return { processed: false, reason: verified?.ignored ? "ignored" : "invalid_signature", event: verified?.event };
  }

  if (provider === "PAYSTACK") {
    const rec = require("./payments/paystack.settlementReconcile.service");
    const applied = await rec.reconcilePaystackSettlementById(verified.settlementId, {
      source: "settlement_webhook",
      status: verified.status,
      notify: true,
      scopedSubaccount: verified.subaccount,
      subaccount: verified.subaccount,
    });
    return { processed: !applied.skipped, ...applied };
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
  SETTLEMENT_KPI_DATE_BASIS,
};
