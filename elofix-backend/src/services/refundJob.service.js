const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");
const {
  EPS,
  roundMoney,
  laborGrossFromJob,
  orchestrateJobLaborRefund,
} = require("./providerRefundClawback.service");
const providerTrustScore = require("./providerTrustScore.service");
const { normalizeMeta } = require("./jobMeta.service");

/**
 * Admin-initiated labor refund with gateway-first reversal and provider clawback.
 */
async function processAdminJobRefund({
  jobId,
  laborRefundNet,
  materialsRefundNet = 0,
  adminUserId,
  idempotencyKey,
  requestHash,
  route,
}) {
  const laborNet = roundMoney(laborRefundNet);
  const materialsNet = roundMoney(materialsRefundNet);
  if (laborNet < 0 || materialsNet < 0) {
    throw new AppError("Refund amounts must be non-negative", 400);
  }
  if (laborNet <= 0 && materialsNet <= 0) {
    throw new AppError("At least one refund amount must be greater than zero", 400);
  }

  const txResult = await orchestrateJobLaborRefund({
    jobId,
    laborRefundNet: laborNet,
    materialsRefundNet: materialsNet,
    adminUserId,
    idempotencyKey,
    requestHash,
    route,
    refundKind: "admin_refund",
  });

  if (txResult.replay) {
    const jobService = require("./job.service");
    return jobService.getJobById(jobId);
  }

  const {
    laborNet: processedLaborNet,
    materialsNet: processedMaterialsNet,
    escrowApplied,
    clawbackApplied,
    providerDebtAdded,
    customerId,
    providerUserId,
    gatewayResult,
  } = txResult;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (job?.providerId) {
    const providerRow = await prisma.provider.findUnique({
      where: { userId: job.providerId },
      select: { id: true },
    });
    if (providerRow) {
      const meta = normalizeMeta(job.meta);
      const laborGross = laborGrossFromJob(job, meta);
      const maxNetLabor = roundMoney(laborGross * 0.93);
      const cumulative =
        Number(txResult.cumulativeCustomerNet ?? txResult.metaAfter?.refund?.cumulativeCustomerNet ?? 0) || 0;
      const kind = cumulative >= maxNetLabor - EPS ? "FULL_REFUND" : "PARTIAL_REFUND";
      await providerTrustScore.onRefundResolved(providerRow.id, kind);
    }
  }

  await logAudit(AUDIT_ACTIONS.ADMIN_JOB_REFUND, {
    userId: adminUserId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.JOB,
    entityId: jobId,
    newValue: {
      laborNet: processedLaborNet,
      materialsNet: processedMaterialsNet,
      escrowApplied,
      clawbackApplied,
      providerDebtAdded,
      gatewayOk: gatewayResult?.ok === true,
    },
  });

  try {
    const notificationEvents = require("./notificationEvents.service");
    if (customerId && processedLaborNet > 0) {
      await notificationEvents.notifyCustomerRefundProcessed(customerId, jobId, processedLaborNet);
    }
    if (providerUserId && (clawbackApplied > 0 || providerDebtAdded > 0)) {
      await notificationEvents.notifyProviderRefundClawback(
        providerUserId,
        jobId,
        clawbackApplied,
        providerDebtAdded
      );
    }
  } catch (_e) {
    /* notifications optional */
  }

  const jobService = require("./job.service");
  return jobService.getJobById(jobId);
}

module.exports = {
  processAdminJobRefund,
  laborGrossFromJob,
  roundMoney,
  EPS,
};
