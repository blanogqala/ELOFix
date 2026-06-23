const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { idempotencyGate, idempotencyCommit } = require("../utils/idempotencyTransaction");
const { logAudit } = require("./auditLog.service");
const {
  EPS,
  roundMoney,
  laborGrossFromJob,
  applyProviderRefundClawbackInTransaction,
  processGatewayRefundForJob,
} = require("./providerRefundClawback.service");

/**
 * Admin-initiated labor refund with provider clawback and optional gateway reversal.
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

  const txResult = await prisma.$transaction(
    async (tx) => {
      const gate = await idempotencyGate(tx, { idempotencyKey, requestHash, route });
      if (gate.replay) {
        return { replay: true };
      }

      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job) throw new AppError("Job not found", 404);
      if (!job.laborPaid) {
        throw new AppError("Job has no paid labor to refund", 400);
      }
      if (!job.providerId) {
        throw new AppError("Job has no assigned provider", 400);
      }

      const providerRow = await tx.provider.findUnique({
        where: { userId: job.providerId },
        select: { id: true },
      });
      if (!providerRow) throw new AppError("Provider profile not found", 404);

      const clawbackResult = await applyProviderRefundClawbackInTransaction(tx, {
        job,
        providerProfileId: providerRow.id,
        laborRefundNet: laborNet,
        materialsRefundNet: materialsNet,
        adminUserId,
        idempotencyKey,
        refundKind: "admin_refund",
      });

      await idempotencyCommit(tx, { idempotencyKey, requestHash, route });

      return {
        replay: false,
        ...clawbackResult,
        customerId: job.customerId,
        providerUserId: job.providerId,
      };
    },
    {
      maxWait: 5000,
      timeout: 20000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

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
  } = txResult;

  const gatewayResult = await processGatewayRefundForJob(jobId, processedLaborNet);

  await logAudit("admin.job_refund", {
    userId: adminUserId,
    metadata: {
      jobId,
      laborNet: processedLaborNet,
      materialsNet: processedMaterialsNet,
      escrowApplied,
      clawbackApplied,
      providerDebtAdded,
      gatewayOk: gatewayResult.ok,
    },
  });

  try {
    const notificationEvents = require("./notificationEvents.service");
    if (customerId && processedLaborNet > 0) {
      await notificationEvents.notifyCustomerRefundProcessed?.(customerId, jobId, processedLaborNet);
    }
    if (providerUserId && (clawbackApplied > 0 || providerDebtAdded > 0)) {
      await notificationEvents.notifyProviderRefundClawback?.(
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
