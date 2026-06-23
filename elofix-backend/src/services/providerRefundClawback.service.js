const earningService = require("./earning.service");
const paymentService = require("./payment.service");
const { mutateJobMetaInTransaction, normalizeMeta } = require("./jobMeta.service");
const refundService = require("./payments/refund.service");

const EPS = earningService.EPS;

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function laborGrossFromJob(job, meta) {
  if (job.totalPrice != null && Number(job.totalPrice) > 0) {
    return Number(job.totalPrice);
  }
  if (meta?.servicePrice?.amount != null) {
    return Number(meta.servicePrice.amount);
  }
  return Number(job.price) || 0;
}

function grossToNetLaborRefund(grossAmount, laborGross) {
  const cap = Math.max(0, Number(laborGross) || 0);
  const gross = Math.min(Math.max(0, Number(grossAmount) || 0), cap);
  const maxNet = roundMoney(cap * 0.93);
  return roundMoney(Math.min(gross * 0.93, maxNet));
}

function disputeGrossToLaborNet(action, amount, job, meta) {
  const laborGross = laborGrossFromJob(job, meta);
  const maxNetLabor = roundMoney(laborGross * 0.93);
  if (action === "FULL_REFUND") return maxNetLabor;
  const gross = Math.max(0, Number(amount) || 0);
  return roundMoney(Math.min(grossToNetLaborRefund(gross, laborGross), maxNetLabor));
}

async function resolveCardLast4(userId, meta) {
  const masked = meta?.servicePayment?.maskedPaymentMethod || "";
  const fromMasked = String(masked).replace(/\D/g, "").slice(-4);
  if (fromMasked.length === 4) return fromMasked;

  const cards = await paymentService.getSavedCards(userId);
  const def = cards.find((c) => c.isDefault) || cards[0];
  if (def?.last4) return String(def.last4).slice(-4);
  return "0000";
}

/**
 * Apply provider escrow reversal, clawback, refund debt, and job.meta.refund inside an existing transaction.
 */
async function applyProviderRefundClawbackInTransaction(tx, {
  job,
  providerProfileId,
  laborRefundNet,
  materialsRefundNet = 0,
  adminUserId = null,
  idempotencyKey = null,
  refundKind = "admin_refund",
  disputeId = null,
  skipInvoice = false,
}) {
  const jobId = job.id;
  const laborNet = roundMoney(laborRefundNet);
  const materialsNet = roundMoney(materialsRefundNet);

  const metaBefore = normalizeMeta(job.meta);
  const existingRefund = metaBefore.refund && typeof metaBefore.refund === "object" ? metaBefore.refund : {};
  const priorCumulative =
    Number(existingRefund.cumulativeCustomerNet ?? existingRefund.amount ?? 0) || 0;

  const laborGross = laborGrossFromJob(job, metaBefore);
  const maxNetLabor = roundMoney(laborGross * 0.93);
  if (laborNet > 0 && priorCumulative + laborNet > maxNetLabor + EPS) {
    const AppError = require("../utils/AppError");
    throw new AppError(
      `Labor refund exceeds maximum net refund of R${maxNetLabor.toFixed(2)} (93% of R${laborGross.toFixed(2)})`,
      400
    );
  }

  let escrowApplied = 0;
  let clawbackApplied = 0;
  let providerDebtAdded = 0;

  if (laborNet > 0 && providerProfileId) {
    const heldFromJob = Math.max(
      0,
      roundMoney(Number(job.providerAmount || 0) - Number(job.releasedAmount || 0))
    );
    const escrowTarget = Math.min(laborNet, heldFromJob);

    escrowApplied = await earningService.applyEscrowToRefund(tx, {
      providerId: providerProfileId,
      jobId,
      amount: escrowTarget,
    });
    if (escrowApplied < escrowTarget - EPS) {
      escrowApplied = escrowTarget;
    }

    let stillNeeded = roundMoney(laborNet - escrowApplied);
    if (stillNeeded > EPS) {
      clawbackApplied = await earningService.clawbackFromAvailable(tx, {
        providerId: providerProfileId,
        jobId,
        amount: stillNeeded,
        idempotencyKey,
      });
      stillNeeded = roundMoney(stillNeeded - clawbackApplied);
    }

    if (stillNeeded > EPS) {
      await earningService.createRefundDebt(tx, {
        providerId: providerProfileId,
        jobId,
        amount: stillNeeded,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:debt` : undefined,
      });
      providerDebtAdded = stillNeeded;
    }
  }

  const cumulativeCustomerNet = roundMoney(priorCumulative + laborNet);
  const cardLast4 = await resolveCardLast4(job.customerId, metaBefore);
  const isFullRefund = laborNet > 0 && cumulativeCustomerNet >= maxNetLabor - EPS;
  const refundStatusLabel =
    laborNet + materialsNet <= 0 ? "pending" : isFullRefund ? "processed" : "partial";

  if (!skipInvoice && (laborNet > 0 || materialsNet > 0)) {
    await paymentService.createRefundInvoiceInTransaction(tx, {
      userId: job.customerId,
      jobId,
      laborRefund: laborNet,
      materialsRefund: materialsNet,
      cardLast4,
      meta: {
        adminRefund: true,
        processedByAdminId: adminUserId,
        escrowApplied,
        clawbackApplied,
        providerDebtAdded,
        refundKind,
        disputeId,
      },
    });
  }

  const heldBefore = Number(metaBefore.escrow?.heldAmount) || 0;
  const heldAfter = Math.max(0, roundMoney(heldBefore - escrowApplied));

  const metaAfter = await mutateJobMetaInTransaction(tx, jobId, (m) => ({
    ...m,
    refund: {
      ...(m.refund && typeof m.refund === "object" ? m.refund : {}),
      customerNet: laborNet,
      materialsNet,
      amount: cumulativeCustomerNet,
      cumulativeCustomerNet,
      status: refundStatusLabel,
      kind: refundKind,
      escrowApplied,
      clawbackApplied,
      providerDebtAdded,
      processedAt: new Date().toISOString(),
      processedByAdminId: adminUserId,
      disputeId: disputeId || null,
      paymentMethodLast4: cardLast4,
    },
    escrow: {
      heldAmount: heldAfter,
      releasedAmount: Number(m.escrow?.releasedAmount ?? job.releasedAmount ?? 0),
    },
    paymentSettlementStatus: "refund",
  }));

  let jobRow = job;
  if (paymentService.isEscrowV2Job(job) && escrowApplied > EPS) {
    const provAmt = Number(job.providerAmount) || 0;
    const relAmt = Number(job.releasedAmount) || 0;
    const newHeld = Math.max(0, provAmt - relAmt - escrowApplied);
    const fullyRefundedEscrow = newHeld <= EPS && cumulativeCustomerNet >= maxNetLabor - EPS;
    jobRow = await tx.job.update({
      where: { id: jobId },
      data: {
        isFullyReleased: fullyRefundedEscrow ? true : job.isFullyReleased,
        paymentReleased: fullyRefundedEscrow ? true : job.paymentReleased,
      },
    });
  }

  return {
    jobRow,
    metaAfter,
    laborNet,
    materialsNet,
    escrowApplied,
    clawbackApplied,
    providerDebtAdded,
    cumulativeCustomerNet,
    refundStatusLabel,
  };
}

async function processGatewayRefundForJob(jobId, laborNet) {
  if (laborNet <= EPS) return { ok: false, reason: "zero_amount" };

  const prisma = require("../config/prisma");
  const intent = await prisma.paymentIntent.findFirst({
    where: {
      jobId,
      kind: "LABOR",
      state: { in: ["PAID", "PARTIALLY_REFUNDED"] },
    },
    orderBy: { paidAt: "desc" },
  });
  if (!intent) return { ok: false, reason: "no_intent" };

  const gatewayResult = await refundService.requestGatewayRefund(intent.id, laborNet);
  if (!gatewayResult.ok) {
    await prisma.$transaction(async (tx) => {
      await mutateJobMetaInTransaction(tx, jobId, (m) => ({
        ...m,
        refund: {
          ...(m.refund && typeof m.refund === "object" ? m.refund : {}),
          status: "gateway_failed",
          gatewayResult,
        },
      }));
    });
  }
  return gatewayResult;
}

module.exports = {
  EPS,
  roundMoney,
  laborGrossFromJob,
  grossToNetLaborRefund,
  disputeGrossToLaborNet,
  applyProviderRefundClawbackInTransaction,
  processGatewayRefundForJob,
};
