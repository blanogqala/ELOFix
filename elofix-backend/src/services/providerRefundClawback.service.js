const earningService = require("./earning.service");
const paymentService = require("./payment.service");
const { mutateJobMetaInTransaction, normalizeMeta } = require("./jobMeta.service");
const refundService = require("./payments/refund.service");
const {
  EPS,
  roundMoney,
  laborGrossFromJob,
  paidLaborGrossFromJob,
  remainingRefundableLaborGross,
  netCourierCancelRefundFromGross,
  grossToNetLaborRefund,
  disputeGrossToLaborNet,
  classifyGatewayRefundResult,
  resolveRefundStatusAfterGateway,
} = require("../utils/refundMath.util");

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
  refundStatusOverride = null,
}) {
  const jobId = job.id;
  const laborNet = roundMoney(laborRefundNet);
  const materialsNet = roundMoney(materialsRefundNet);

  const metaBefore = normalizeMeta(job.meta);
  const existingRefund = metaBefore.refund && typeof metaBefore.refund === "object" ? metaBefore.refund : {};
  const priorCumulative =
    Number(existingRefund.cumulativeCustomerNet ?? existingRefund.amount ?? 0) || 0;

  const paidGross = paidLaborGrossFromJob(job, metaBefore);
  const maxNetLabor = netCourierCancelRefundFromGross(paidGross);
  if (laborNet > 0 && priorCumulative + laborNet > maxNetLabor + EPS) {
    const AppError = require("../utils/AppError");
    throw new AppError(
      `Labor refund exceeds maximum refundable amount of R${maxNetLabor.toFixed(2)} (paid tranches minus prior refunds)`,
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
    // heldPortion: fund customer refund from THIS job's escrow only (admin hold or courier pre-delivery).
    const heldPortion = Math.min(laborNet, heldFromJob);
    // releasedPortion: provider share already paid out — recovered only via available balance, then refund_debt.
    const releasedPortion = roundMoney(laborNet - heldPortion);

    escrowApplied = await earningService.applyEscrowToRefund(tx, {
      providerId: providerProfileId,
      jobId,
      amount: heldPortion,
    });

    const providerRecoveryNeeded = roundMoney(laborNet - escrowApplied);
    const releasedRecoveryTarget = Math.min(providerRecoveryNeeded, releasedPortion);

    if (releasedRecoveryTarget > EPS) {
      clawbackApplied = await earningService.clawbackFromAvailable(tx, {
        providerId: providerProfileId,
        jobId,
        amount: releasedRecoveryTarget,
        idempotencyKey,
      });
      const debtAmount = roundMoney(releasedRecoveryTarget - clawbackApplied);
      if (debtAmount > EPS) {
        await earningService.createRefundDebt(tx, {
          providerId: providerProfileId,
          jobId,
          amount: debtAmount,
          idempotencyKey: idempotencyKey ? `${idempotencyKey}:debt` : undefined,
        });
        providerDebtAdded = debtAmount;
      }
    }
  }

  const cumulativeCustomerNet = roundMoney(priorCumulative + laborNet);
  const immediateCustomerRefund = roundMoney(escrowApplied + clawbackApplied);
  const pendingCustomerRefund = providerDebtAdded;
  const cardLast4 = await resolveCardLast4(job.customerId, metaBefore);
  const isFullRefund = laborNet > 0 && cumulativeCustomerNet >= maxNetLabor - EPS;
  const refundStatusLabel =
    refundStatusOverride ||
    (laborNet + materialsNet <= 0
      ? "pending"
      : pendingCustomerRefund > EPS
        ? isFullRefund
          ? "partial_pending_recovery"
          : "partial"
        : isFullRefund
          ? "processed"
          : "partial");

  const invoiceLaborAmount =
    pendingCustomerRefund > EPS ? immediateCustomerRefund : laborNet;

  if (!skipInvoice && (laborNet > 0 || materialsNet > 0) && invoiceLaborAmount > EPS) {
    await paymentService.createRefundInvoiceInTransaction(tx, {
      userId: job.customerId,
      jobId,
      laborRefund: invoiceLaborAmount,
      materialsRefund: materialsNet,
      cardLast4,
      meta: {
        adminRefund: true,
        processedByAdminId: adminUserId,
        escrowApplied,
        clawbackApplied,
        providerDebtAdded,
        immediateRefund: immediateCustomerRefund,
        pendingRefund: pendingCustomerRefund,
        refundKind,
        disputeId,
        staged: pendingCustomerRefund > EPS,
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
      immediateRefund: immediateCustomerRefund,
      pendingRefund: pendingCustomerRefund,
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

  if (providerDebtAdded > EPS && providerProfileId) {
    const refundRecovery = require("./refundRecovery.service");
    await refundRecovery.createRefundRecoveryInTransaction(tx, {
      providerId: providerProfileId,
      customerId: job.customerId,
      jobId,
      disputeId: disputeId || null,
      amount: providerDebtAdded,
    });
  }

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
    immediateCustomerRefund,
    pendingCustomerRefund,
    cumulativeCustomerNet,
    refundStatusLabel,
  };
}

async function findRefundableLaborIntent(jobId) {
  const intents = await refundService.findRefundableLaborIntents(jobId);
  // Prefer oldest unpaid-refundable slice; keep helper name for callers.
  return intents[0] || null;
}

/**
 * Attempt gateway refund before ledger clawback when the provider supports API refunds.
 * Uses FIFO across paid LABOR intents (deposit then completion).
 */
async function attemptGatewayRefundFirst(jobId, laborNet) {
  if (laborNet <= EPS) {
    return { attempted: false, result: { ok: false, reason: "zero_amount" }, manualOnly: false, failed: false };
  }
  const multi = await refundService.refundJobLaborAcrossIntents(jobId, laborNet, {
    idempotencyKey: `staged:${jobId}:${Number(laborNet).toFixed(2)}`,
  });
  const result = {
    ok: multi.ok,
    supported: multi.supported,
    requiresManualAction: multi.requiresManualAction,
    message: multi.message,
    reason: multi.message,
    results: multi.results,
    refundedTotal: multi.refundedTotal,
  };
  if (!multi.originalPaymentIntentIds?.length && multi.message === "no_paid_intent") {
    return {
      attempted: false,
      result: { ok: false, reason: "no_intent" },
      manualOnly: false,
      failed: false,
    };
  }
  const { manualOnly, success, failed } = classifyGatewayRefundResult(result);
  return { attempted: !manualOnly, result, manualOnly, failed };
}

/**
 * Gateway-first labor refund: API refund when supported, then provider clawback in one transaction.
 */
async function orchestrateJobLaborRefund({
  jobId,
  laborRefundNet,
  materialsRefundNet = 0,
  adminUserId = null,
  idempotencyKey = null,
  requestHash = null,
  route = null,
  refundKind = "admin_refund",
  disputeId = null,
  skipInvoice = false,
  skipGatewayAttempt = false,
}) {
  const { Prisma } = require("@prisma/client");
  const prisma = require("../config/prisma");
  const AppError = require("../utils/AppError");
  const { idempotencyGate, idempotencyCommit } = require("../utils/idempotencyTransaction");

  const laborNet = roundMoney(laborRefundNet);
  const materialsNet = roundMoney(materialsRefundNet);

  let gatewayPreflight = {
    attempted: false,
    result: null,
    manualOnly: false,
    failed: false,
  };
  if (!skipGatewayAttempt) {
    let gatewayAmount = laborNet;
    if (laborNet > EPS) {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      let providerProfileId = null;
      if (job?.providerId) {
        const providerRow = await prisma.provider.findUnique({
          where: { userId: job.providerId },
          select: { id: true },
        });
        providerProfileId = providerRow?.id || null;
      }
      if (job && providerProfileId) {
        const refundRecovery = require("./refundRecovery.service");
        const split = await refundRecovery.previewProviderRefundSplit(
          job,
          providerProfileId,
          laborNet
        );
        gatewayAmount = split.immediateCustomerRefund;
      }
    }
    gatewayPreflight = await attemptGatewayRefundFirst(jobId, gatewayAmount);
    if (gatewayPreflight.failed) {
      const reason = gatewayPreflight.result?.error || gatewayPreflight.result?.reason || "unknown";
      throw new AppError(`Gateway refund failed: ${reason}`, 502);
    }
  }

  const txResult = await prisma.$transaction(
    async (tx) => {
      if (idempotencyKey && requestHash && route) {
        const gate = await idempotencyGate(tx, { idempotencyKey, requestHash, route });
        if (gate.replay) {
          return { replay: true };
        }
      }

      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job) throw new AppError("Job not found", 404);
      if (laborNet > 0 && !job.laborPaid) {
        throw new AppError("Job has no paid labor to refund", 400);
      }

      let providerProfileId = null;
      if (job.providerId) {
        const providerRow = await tx.provider.findUnique({
          where: { userId: job.providerId },
          select: { id: true },
        });
        providerProfileId = providerRow?.id || null;
      }

      const metaBefore = normalizeMeta(job.meta);
      const laborGross = laborGrossFromJob(job, metaBefore);
      const maxNetLabor = roundMoney(laborGross * 0.93);
      const existingRefund =
        metaBefore.refund && typeof metaBefore.refund === "object" ? metaBefore.refund : {};
      const priorCumulative =
        Number(existingRefund.cumulativeCustomerNet ?? existingRefund.amount ?? 0) || 0;
      const cumulativeAfter = roundMoney(priorCumulative + laborNet);
      const isFullRefund = laborNet > 0 && cumulativeAfter >= maxNetLabor - EPS;
      const refundStatusOverride = resolveRefundStatusAfterGateway({
        manualOnly: gatewayPreflight.manualOnly,
        gatewaySuccess: gatewayPreflight.result?.ok === true,
        isFullRefund,
      });

      const clawbackResult = await applyProviderRefundClawbackInTransaction(tx, {
        job,
        providerProfileId,
        laborRefundNet: laborNet,
        materialsRefundNet: materialsNet,
        adminUserId,
        idempotencyKey,
        refundKind,
        disputeId,
        skipInvoice,
        refundStatusOverride,
      });

      if (idempotencyKey && requestHash && route) {
        await idempotencyCommit(tx, { idempotencyKey, requestHash, route });
      }

      return {
        replay: false,
        ...clawbackResult,
        customerId: job.customerId,
        providerUserId: job.providerId,
        gatewayResult: gatewayPreflight.result,
        gatewayManualOnly: gatewayPreflight.manualOnly,
      };
    },
    {
      maxWait: 5000,
      timeout: 20000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  return txResult;
}

async function processGatewayRefundForJob(jobId, laborNet) {
  if (laborNet <= EPS) return { ok: false, reason: "zero_amount" };

  const prisma = require("../config/prisma");
  const gatewayResult = await refundService.refundJobLaborAcrossIntents(jobId, laborNet, {
    idempotencyKey: `process:${jobId}:${Number(laborNet).toFixed(2)}`,
  });
  if (!gatewayResult.ok) {
    await prisma.$transaction(async (tx) => {
      await mutateJobMetaInTransaction(tx, jobId, (m) => ({
        ...m,
        refund: {
          ...(m.refund && typeof m.refund === "object" ? m.refund : {}),
          status: gatewayResult.requiresManualAction
            ? "pending_manual_gateway"
            : "gateway_failed",
          customerRefundStatus: gatewayResult.requiresManualAction
            ? "REFUND_MANUAL_ACTION_REQUIRED"
            : "REFUND_FAILED",
          gatewayResult,
          originalPaymentIntentIds: gatewayResult.originalPaymentIntentIds || [],
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
  paidLaborGrossFromJob,
  remainingRefundableLaborGross,
  grossToNetLaborRefund,
  disputeGrossToLaborNet,
  applyProviderRefundClawbackInTransaction,
  findRefundableLaborIntent,
  classifyGatewayRefundResult,
  attemptGatewayRefundFirst,
  resolveRefundStatusAfterGateway,
  orchestrateJobLaborRefund,
  processGatewayRefundForJob,
};
