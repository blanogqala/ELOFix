const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../config/prisma");
const AppError = require("../../utils/AppError");
const paymentService = require("../payment.service");
const { getJobMeta } = require("../jobMeta.service");
const { paymentCurrency } = require("./paymentConfig");

function toAmountDecimal(amount) {
  return new Prisma.Decimal(String(Number(amount).toFixed(2)));
}

function providerChannel(provider) {
  return String(provider || "").toLowerCase();
}

/**
 * Settle labor from a paid PaymentIntent (immediate-settlement or legacy escrow).
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function settleLaborFromIntent(tx, intent, gatewayPayload) {
  const settlement = require("./settlement.service");
  return settlement.settleLaborFromIntent(tx, intent, gatewayPayload);
}

/**
 * Mark material order paid after gateway confirmation.
 */
async function settleMaterialOrderFromIntent(tx, intent) {
  if (!intent.materialOrderId) {
    throw new AppError("Material payment requires materialOrderId", 400);
  }
  const order = await tx.materialOrder.findUnique({ where: { id: intent.materialOrderId } });
  if (!order) {
    throw new AppError("Material order not found", 404);
  }
  if (order.paymentStatus === "paid") {
    return { alreadyPaid: true, order };
  }

  const subtotalPersisted = Number(order.materialsSubtotal);
  const p = order.payload && typeof order.payload === "object" ? order.payload : {};
  const subtotalMajor =
    Number.isFinite(subtotalPersisted) && subtotalPersisted > 0
      ? subtotalPersisted
      : Number(p.totalAmount || p.total || p.materialsSubtotal || 0);
  const subtotal = toAmountDecimal(subtotalMajor);
  // Intent amount must match the persisted order subtotal (server-authoritative).
  const paymentModeService = require("./paymentMode.service");
  paymentModeService.assertAmountMatchesExpected(intent.amount, subtotal);

  const commission = subtotal.mul(0.07).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const supplierEarning = subtotal.sub(commission).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const payload =
    order.payload && typeof order.payload === "object" ? { ...order.payload } : {};
  payload.payment = {
    provider: intent.provider,
    merchantReference: intent.merchantReference,
    gatewayTransactionId: intent.gatewayTransactionId,
    paidAt: new Date().toISOString(),
    currency: paymentCurrency(),
  };

  const updated = await tx.materialOrder.update({
    where: { id: order.id },
    data: {
      paymentStatus: "paid",
      platformCommission: commission,
      supplierEarning,
      payload,
    },
  });

  const settlement = require("./settlement.service");
  await settlement.stampIntentCommission(tx, intent, subtotal, null);

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: {
      paymentType: "MATERIAL_ORDER",
      escrowStatus: "NOT_APPLICABLE",
    },
  });

  const branchSettlement = require("../branchSettlement.service");
  await branchSettlement.initiateSettlementAfterPayment(tx, intent, updated);

  return { alreadyPaid: false, order: updated };
}

function checkoutMetaFromIntent(intent) {
  const p =
    intent.gatewayPayload && typeof intent.gatewayPayload === "object" && !Array.isArray(intent.gatewayPayload)
      ? intent.gatewayPayload
      : {};
  return p;
}

/**
 * Job-linked store materials (JOB_STORE_ORDER without materialOrderId).
 * Runs after intent is PAID; idempotent via payForStoreMaterials.
 */
async function settleJobStoreOrderFromIntent(intent) {
  if (!intent || String(intent.kind || "") !== "JOB_STORE_ORDER") {
    return { skipped: true };
  }
  if (intent.materialOrderId) {
    return { skipped: true, reason: "material_order_linked" };
  }
  const jobId = intent.jobId ? String(intent.jobId) : "";
  if (!jobId) {
    throw new AppError("Job store payment requires jobId", 400);
  }

  // Resolve store order from job meta (server-authoritative), using metadata as locator only.
  const { getJobMeta } = require("../jobMeta.service");
  const jobMeta = await getJobMeta(jobId);
  const storeOrders = Array.isArray(jobMeta.storeOrders) ? jobMeta.storeOrders : [];
  const meta = checkoutMetaFromIntent(intent);
  const orderIdHint = meta.orderId ? String(meta.orderId).trim() : "";
  const supplierIdHint = meta.supplierId ? String(meta.supplierId).trim() : "";

  const match = storeOrders.find((o) => {
    if (!o || typeof o !== "object") return false;
    if (orderIdHint && String(o.orderId || "") === orderIdHint) return true;
    if (supplierIdHint && String(o.supplierId || "") === supplierIdHint) return true;
    return false;
  });
  if (!match) {
    throw new AppError("Store order not found for this job payment", 404);
  }
  if (match.payment?.materialsPaid === true) {
    return { alreadyApplied: true };
  }

  const supplierId = String(match.supplierId || supplierIdHint || "").trim();
  if (!supplierId) {
    throw new AppError("Payment metadata missing supplierId", 400);
  }

  // Reconcile intent amount against persisted store-order total.
  const items = Array.isArray(match.items) ? match.items : [];
  const materialsTotal = items.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || item.price || 0),
    0
  );
  const deliveryFee = Number(
    match.deliveryFee != null ? match.deliveryFee : match.delivery?.fee || meta.deliveryFee || 0
  );
  const expectedTotal = materialsTotal + (Number.isFinite(deliveryFee) ? deliveryFee : 0);
  const paymentModeService = require("./paymentMode.service");
  paymentModeService.assertAmountMatchesExpected(intent.amount, expectedTotal);

  const jobService = require("../job.service");
  try {
    await jobService.payForStoreMaterials(
      jobId,
      supplierId,
      "****",
      {
        paymentIntentId: intent.id,
        deliveryType: match.deliveryType || meta.deliveryType || "SELF",
        deliveryFee,
        deliveryProviderId:
          match.deliveryProviderId ||
          (meta.deliveryProviderId ? String(meta.deliveryProviderId) : undefined),
        orderId: match.orderId ? String(match.orderId) : orderIdHint || undefined,
      },
      String(intent.userId || "")
    );
  } catch (e) {
    const msg = String(e?.message || "");
    if (e?.statusCode === 400 && /already|paid|no longer active/i.test(msg)) {
      return { alreadyApplied: true };
    }
    throw e;
  }

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      escrowStatus: "NOT_APPLICABLE",
      providerPayoutStatus: "COMPLETE",
    },
  });

  return { applied: true };
}

/**
 * After job second tranche, sync PaymentIntent escrow flags.
 * @param {string} jobId
 * @param {import("@prisma/client").Prisma.TransactionClient} [tx]
 */
async function markLaborEscrowFullyReleased(jobId, tx) {
  const client = tx || prisma;
  await client.paymentIntent.updateMany({
    where: {
      jobId: String(jobId),
      kind: "LABOR",
      state: "PAID",
    },
    data: {
      escrowStatus: "FULLY_RELEASED",
      providerPayoutStatus: "COMPLETE",
    },
  });
}

/**
 * On job cancel refund bookkeeping, mark intent refunded when applicable.
 */
async function markLaborIntentRefunded(jobId) {
  await prisma.paymentIntent.updateMany({
    where: {
      jobId: String(jobId),
      kind: "LABOR",
      state: "PAID",
    },
    data: {
      state: "REFUNDED",
      escrowStatus: "REFUNDED",
      refundedAt: new Date(),
    },
  });
}

async function markMaterialIntentRefunded(materialOrderId, partial = false) {
  await prisma.paymentIntent.updateMany({
    where: { materialOrderId: String(materialOrderId), state: "PAID" },
    data: {
      state: partial ? "PARTIALLY_REFUNDED" : "REFUNDED",
      refundedAt: new Date(),
    },
  });
}

async function markIntentDisputed(intentId) {
  await prisma.paymentIntent.update({
    where: { id: intentId },
    data: { state: "DISPUTED", disputedAt: new Date() },
  });
}

/**
 * Settle delivery fee after gateway confirmation (courier / material delivery).
 */
async function settleDeliveryFeeFromIntent(intent) {
  const meta =
    intent.gatewayPayload && typeof intent.gatewayPayload === "object" && !Array.isArray(intent.gatewayPayload)
      ? intent.gatewayPayload
      : {};
  const deliveryRequestId = meta.deliveryRequestId ? String(meta.deliveryRequestId).trim() : "";

  if (deliveryRequestId) {
    const deliveryRequestService = require("../deliveryRequest.service");
    await deliveryRequestService.settleDeliveryRequestPayment(deliveryRequestId, intent);
  } else if (intent.materialOrderId) {
    const materialOrderService = require("../materialOrder.service");
    await materialOrderService.markMaterialOrderDeliveryPaid(String(intent.materialOrderId), {
      fee: Number(intent.amount),
      merchantReference: intent.merchantReference,
      provider: intent.provider,
      gatewayTransactionId: intent.gatewayTransactionId,
      paidAt: intent.paidAt ? new Date(intent.paidAt).toISOString() : new Date().toISOString(),
      invoiceId: `INV-DEL-${intent.merchantReference || intent.id}`,
    });
  } else {
    throw new AppError("Delivery fee payment requires deliveryRequestId or materialOrderId", 400);
  }

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      escrowStatus: "NOT_APPLICABLE",
      providerPayoutStatus: "COMPLETE",
    },
  });

  return { deliveryRequestId: deliveryRequestId || undefined, materialOrderId: intent.materialOrderId || undefined };
}

module.exports = {
  settleLaborFromIntent,
  settleMaterialOrderFromIntent,
  settleJobStoreOrderFromIntent,
  settleDeliveryFeeFromIntent,
  markLaborEscrowFullyReleased,
  markLaborIntentRefunded,
  markMaterialIntentRefunded,
  markIntentDisputed,
};
