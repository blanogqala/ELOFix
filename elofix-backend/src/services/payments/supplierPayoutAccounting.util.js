const prisma = require("../../config/prisma");
const { computeExpectedBankSettlement } = require("./money.util");
const { resolveAuthoritativeProcessorFee, toMajorDecimal } = require("./payoutTransparency.util");
const {
  SUPPLIER_RECIPIENT_KINDS,
  MATERIALS_SUPPLIER_KINDS,
  positiveMajor,
  isSupplierRecipientKind,
  resolveSupplierRecipientGrossMajor,
} = require("./supplierPayoutAmounts.util");

const MATERIAL_ORDER_INCLUDE = {
  materialOrder: {
    select: {
      id: true,
      branchId: true,
      supplierId: true,
      jobId: true,
      paymentStatus: true,
      materialsSubtotal: true,
      supplierEarning: true,
      payload: true,
    },
  },
};

function checkoutMetaFromIntent(intent) {
  const payload =
    intent?.gatewayPayload && typeof intent.gatewayPayload === "object" && !Array.isArray(intent.gatewayPayload)
      ? intent.gatewayPayload
      : {};
  return payload;
}

function orderIdHintFromIntent(intent, hints = {}) {
  const hinted = String(hints.orderIdHint || "").trim();
  if (hinted) return hinted;
  const meta = checkoutMetaFromIntent(intent);
  return String(meta.orderId || meta.jobStoreOrderId || "").trim();
}

function db(hints = {}) {
  return hints.client || prisma;
}

async function findAuthoritativeLinkedMaterialOrder(intent, hints = {}) {
  const client = db(hints);
  if (intent?.materialOrder?.id) return intent.materialOrder;
  if (intent?.materialOrderId) {
    return client.materialOrder.findUnique({
      where: { id: String(intent.materialOrderId) },
      select: MATERIAL_ORDER_INCLUDE.materialOrder.select,
    });
  }

  const kind = String(intent?.kind || "").trim().toUpperCase();
  if (!MATERIALS_SUPPLIER_KINDS.has(kind)) return null;

  const hint = orderIdHintFromIntent(intent, hints);
  if (!hint) return null;

  const byId = await client.materialOrder.findUnique({
    where: { id: hint },
    select: MATERIAL_ORDER_INCLUDE.materialOrder.select,
  });
  if (byId) {
    if (intent.jobId && byId.jobId && String(byId.jobId) !== String(intent.jobId)) {
      return null;
    }
    return byId;
  }

  if (!intent.jobId) return null;
  const candidates = await client.materialOrder.findMany({
    where: { jobId: String(intent.jobId), paymentStatus: "paid" },
    select: MATERIAL_ORDER_INCLUDE.materialOrder.select,
  });
  const matched = candidates.filter((order) => {
    const payload = order.payload && typeof order.payload === "object" ? order.payload : {};
    return String(payload.jobStoreOrderId || payload.orderId || "") === hint;
  });
  if (matched.length === 1) return matched[0];
  return null;
}

async function persistExpectedBankIfKnown(intent, hints = {}) {
  const client = db(hints);
  if (!intent?.id) return intent;
  if (positiveMajor(intent.expectedBankSettlementAmount) != null && intent.processorFeeAmount != null) {
    return intent;
  }
  const fee = resolveAuthoritativeProcessorFee({
    intent,
    evidence: intent.gatewayPayload,
  });
  const gross = resolveSupplierRecipientGrossMajor(intent);
  const net = computeExpectedBankSettlement(gross, fee);
  if (net.processorFeeAmount == null && net.expectedBankSettlementAmount == null) {
    return intent;
  }
  return client.paymentIntent.update({
    where: { id: intent.id },
    data: {
      processorFeeAmount: net.processorFeeAmount,
      expectedBankSettlementAmount: net.expectedBankSettlementAmount,
    },
    include: MATERIAL_ORDER_INCLUDE,
  });
}

async function stampMissingSupplierRecipient(intent, order, hints = {}) {
  const client = db(hints);
  if (positiveMajor(intent?.recipientAmount) != null) return intent;
  const kind = String(intent?.kind || "").trim().toUpperCase();
  if (!MATERIALS_SUPPLIER_KINDS.has(kind)) return intent;

  const stampGross = positiveMajor(intent.amount) || positiveMajor(order?.materialsSubtotal);
  if (stampGross != null) {
    const settlement = require("./settlement.service");
    await settlement.stampIntentCommission(client, intent, stampGross, null);
    return client.paymentIntent.findUnique({
      where: { id: intent.id },
      include: MATERIAL_ORDER_INCLUDE,
    });
  }

  const earning = positiveMajor(order?.supplierEarning);
  if (earning == null) return intent;
  return client.paymentIntent.update({
    where: { id: intent.id },
    data: { recipientAmount: toMajorDecimal(earning) },
    include: MATERIAL_ORDER_INCLUDE,
  });
}

/**
 * Safely persist missing supplier payout bookkeeping.
 * Does not change payoutSettlementStatus. Settlement Success still comes
 * only from the Paystack Settlement API.
 */
async function repairSupplierMarketplacePayoutAccounting(intent, hints = {}) {
  if (!intent?.id) return intent;
  if (String(intent.state || "").trim().toUpperCase() !== "PAID") return intent;
  if (!isSupplierRecipientKind(intent.kind)) return intent;

  let row = intent;
  const order = await findAuthoritativeLinkedMaterialOrder(row, hints);
  const link = {};
  if (order?.id && !row.materialOrderId) link.materialOrderId = order.id;
  if (order?.branchId && !row.branchId) link.branchId = String(order.branchId);

  const client = db(hints);
  if (Object.keys(link).length) {
    row = await client.paymentIntent.update({
      where: { id: row.id },
      data: link,
      include: MATERIAL_ORDER_INCLUDE,
    });
  } else if (!row.materialOrder && order) {
    row = { ...row, materialOrder: order };
  } else if (!row.materialOrder && row.materialOrderId) {
    const loaded = await client.paymentIntent.findUnique({
      where: { id: row.id },
      include: MATERIAL_ORDER_INCLUDE,
    });
    if (loaded) row = loaded;
  }

  row = await stampMissingSupplierRecipient(row, row.materialOrder || order, hints);
  row = await persistExpectedBankIfKnown(
    {
      ...row,
      materialOrder: row.materialOrder || order || null,
    },
    hints
  );
  return row;
}

async function prepareSupplierAmountMatchCandidate(intent) {
  return repairSupplierMarketplacePayoutAccounting(intent);
}

module.exports = {
  SUPPLIER_RECIPIENT_KINDS,
  MATERIAL_ORDER_INCLUDE,
  positiveMajor,
  isSupplierRecipientKind,
  resolveSupplierRecipientGrossMajor,
  findAuthoritativeLinkedMaterialOrder,
  repairSupplierMarketplacePayoutAccounting,
  prepareSupplierAmountMatchCandidate,
  persistExpectedBankIfKnown,
};
