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
 * Settle labor escrow from a paid PaymentIntent.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function settleLaborFromIntent(tx, intent, gatewayPayload) {
  const jobId = intent.jobId;
  if (!jobId) {
    throw new AppError("Labor payment requires jobId", 400);
  }
  const job = await tx.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new AppError("Job not found", 404);
  }
  if (job.laborPaid) {
    return { alreadySettled: true, job };
  }
  if (!job.providerId) {
    throw new AppError("Job has no provider", 400);
  }
  const prov = await tx.provider.findUnique({ where: { userId: job.providerId }, select: { id: true } });
  if (!prov) {
    throw new AppError("Provider profile not found", 404);
  }

  const meta = await getJobMeta(jobId);
  const expected = paymentService.expectedLaborGrossFromJob(job, meta);
  const gross = toAmountDecimal(intent.amount);
  const diff = gross.sub(expected).abs();
  if (diff.gt(0.02)) {
    throw new AppError("Paid amount does not match job price", 400);
  }

  const paidAt = new Date().toISOString();
  const last4 = String(gatewayPayload?.card_last4 || gatewayPayload?.last4 || "****");

  await paymentService.runSettleLaborInTransaction(tx, {
    job,
    jobId,
    customerUserId: intent.userId,
    providerProfileId: prov.id,
    gross,
    paymentRef: intent.merchantReference,
    paidAt,
    cardLast4: last4,
    idempotencyKeyForEarnings: intent.idempotencyKey ? `${intent.idempotencyKey}::t1` : `intent-${intent.id}`,
    channel: providerChannel(intent.provider),
  });

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: {
      escrowStatus: "PARTIALLY_RELEASED",
      providerPayoutStatus: "PARTIAL",
    },
  });

  const updated = await tx.job.findUnique({ where: { id: jobId } });
  return { alreadySettled: false, job: updated, settledAudit: { intentId: intent.id, userId: intent.userId, jobId, amount: Number(intent.amount) } };
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

  const subtotal = toAmountDecimal(order.materialsSubtotal);
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

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: {
      escrowStatus: "NOT_APPLICABLE",
      providerPayoutStatus: "COMPLETE",
    },
  });

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
  const meta = checkoutMetaFromIntent(intent);
  const supplierId = meta.supplierId ? String(meta.supplierId).trim() : "";
  if (!supplierId) {
    throw new AppError("Payment metadata missing supplierId", 400);
  }

  const jobService = require("../job.service");
  try {
    await jobService.payForStoreMaterials(
      jobId,
      supplierId,
      "****",
      {
        paymentIntentId: intent.id,
        deliveryType: meta.deliveryType || "SELF",
        deliveryFee: Number(meta.deliveryFee || 0),
        deliveryProviderId: meta.deliveryProviderId ? String(meta.deliveryProviderId) : undefined,
        orderId: meta.orderId ? String(meta.orderId) : undefined,
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
