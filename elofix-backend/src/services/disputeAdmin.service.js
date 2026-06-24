const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");
const {
  getJobMeta,
  mutateJobMetaInTransaction,
  enrichJob,
} = require("./jobMeta.service");
const jobProgressUtil = require("../utils/jobProgress.util");
const paymentService = require("./payment.service");
const providerTrustScore = require("./providerTrustScore.service");
const jobCompletionEvidence = require("./jobCompletionEvidence.service");
const notificationEvents = require("./notificationEvents.service");
const disputeRoundService = require("./disputeRound.service");
const {
  applyProviderRefundClawbackInTransaction,
  disputeGrossToLaborNet,
  processGatewayRefundForJob,
} = require("./providerRefundClawback.service");
const { normalizeMeta } = require("./jobMeta.service");
const { UPLOAD_ROOT } = require("../middleware/upload.middleware");

const VALID_ACTIONS = new Set([
  "RELEASE_FUNDS",
  "PARTIAL_REFUND",
  "FULL_REFUND",
  "RETURN_PROVIDER",
  "CLOSE_CASE",
]);

function toAdminDisputeDto(row) {
  return {
    id: row.id,
    jobId: row.jobId,
    customerId: row.customerId,
    providerId: row.providerId,
    status: row.status,
    requestedResolution: row.requestedResolution,
    customerComment: row.customerComment,
    otherResolutionDetail: row.otherResolutionDetail ?? null,
    customerImages: row.customerImages || [],
    customerVideos: row.customerVideos || [],
    providerComment: row.providerComment,
    providerImages: row.providerImages || [],
    providerVideos: row.providerVideos || [],
    adminNotes: row.adminNotes,
    openedAt: row.openedAt instanceof Date ? row.openedAt.toISOString() : row.openedAt,
    resolvedAt: row.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : row.resolvedAt,
    customerName: row.customer?.name,
    providerName: row.provider?.name,
    jobTitle: row.job?.title,
    jobCategory: row.job?.category,
  };
}

async function listDisputes(filters = {}) {
  const search = String(filters.search || "").trim();
  const statusFilter = String(filters.status || "").trim().toUpperCase();
  const resolutionFilter = String(filters.requestedResolution || "").trim();

  const where = {};
  if (statusFilter && statusFilter !== "ALL") {
    if (statusFilter === "OPEN") where.status = { in: ["OPEN", "UNDER_INVESTIGATION"] };
    else if (statusFilter === "RESOLVED") where.status = { in: ["RESOLVED", "CLOSED"] };
    else where.status = statusFilter;
  }
  if (resolutionFilter) where.requestedResolution = resolutionFilter;
  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { jobId: { contains: search, mode: "insensitive" } },
      { customerComment: { contains: search, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.jobDispute.findMany({
    where,
    orderBy: { openedAt: "desc" },
    include: {
      job: { select: { title: true, category: true } },
    },
  });

  const customerIds = [...new Set(rows.map((r) => r.customerId))];
  const providerIds = [...new Set(rows.map((r) => r.providerId))];
  const users = await prisma.user.findMany({
    where: { id: { in: [...customerIds, ...providerIds] } },
    select: { id: true, name: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return {
    disputes: rows.map((r) =>
      toAdminDisputeDto({
        ...r,
        customer: userMap[r.customerId],
        provider: userMap[r.providerId],
      })
    ),
  };
}

async function getDisputeDetail(disputeId) {
  const row = await prisma.jobDispute.findUnique({
    where: { id: String(disputeId) },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      resolutionLogs: { orderBy: { createdAt: "desc" } },
      job: true,
    },
  });
  if (!row) throw new AppError("Dispute not found", 404);

  const [customer, provider] = await Promise.all([
    prisma.user.findUnique({ where: { id: row.customerId }, select: { id: true, name: true, email: true } }),
    prisma.user.findUnique({ where: { id: row.providerId }, select: { id: true, name: true, email: true } }),
  ]);
  const meta = row.job ? await getJobMeta(row.job.id) : null;
  const evidence = await jobCompletionEvidence.getEvidenceByJobId(row.jobId);
  const rounds = await disputeRoundService.getDisputeRounds(row.id);

  return {
    dispute: toAdminDisputeDto({ ...row, customer, provider }),
    messages: row.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderRole: m.senderRole,
      body: m.body,
      attachments: m.attachments || [],
      createdAt: m.createdAt.toISOString(),
    })),
    resolutionLogs: row.resolutionLogs.map((l) => ({
      id: l.id,
      adminId: l.adminId,
      action: l.action,
      amount: l.amount != null ? Number(l.amount) : null,
      notes: l.notes,
      createdAt: l.createdAt.toISOString(),
    })),
    job: row.job ? enrichJob(row.job, meta) : null,
    completionEvidence: evidence,
    rounds,
  };
}

async function updateDisputeStatus(adminUserId, disputeId, status, adminNotes) {
  const valid = ["UNDER_INVESTIGATION", "OPEN", "RESOLVED", "CLOSED"];
  const st = String(status || "").trim().toUpperCase();
  if (!valid.includes(st)) throw new AppError("Invalid status", 400);

  const before = await prisma.jobDispute.findUnique({
    where: { id: String(disputeId) },
    select: { id: true, status: true },
  });
  if (!before) throw new AppError("Dispute not found", 404);

  const row = await prisma.jobDispute.update({
    where: { id: String(disputeId) },
    data: {
      status: st,
      adminNotes: adminNotes != null ? String(adminNotes) : undefined,
    },
  });

  if (st === "UNDER_INVESTIGATION") {
    await disputeRoundService.syncDisputeStatusToActiveRound(row.id, st);
    await notificationEvents.notifyDisputeUnderInvestigation({
      customerId: row.customerId,
      providerId: row.providerId,
      jobId: row.jobId,
      disputeId: row.id,
    });
  }

  await logAudit(AUDIT_ACTIONS.DISPUTE_STATUS_UPDATE, {
    userId: adminUserId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.DISPUTE,
    entityId: row.id,
    oldValue: { status: before.status },
    newValue: { status: st, adminNotes: adminNotes != null ? String(adminNotes) : undefined },
  });

  return getDisputeDetail(row.id);
}

async function resolveDispute(adminUserId, disputeId, payload) {
  const action = String(payload?.action || "").trim().toUpperCase();
  if (!VALID_ACTIONS.has(action)) throw new AppError("Invalid resolution action", 400);
  const notes = payload?.notes != null ? String(payload.notes) : null;
  const amount = payload?.amount != null ? Number(payload.amount) : null;

  const dispute = await prisma.jobDispute.findUnique({
    where: { id: String(disputeId) },
    include: { job: true },
  });
  if (!dispute) throw new AppError("Dispute not found", 404);
  if (!dispute.job) throw new AppError("Job not found", 404);

  await disputeRoundService.ensureDisputeRounds(dispute.id);

  const job = dispute.job;
  const providerRow = await prisma.provider.findUnique({
    where: { userId: job.providerId },
    select: { id: true },
  });

  await prisma.$transaction(
    async (tx) => {
      await tx.disputeResolutionLog.create({
        data: {
          id: randomUUID(),
          disputeId: dispute.id,
          adminId: String(adminUserId),
          action,
          amount: amount != null && Number.isFinite(amount) ? amount : null,
          notes,
        },
      });

      if (action === "RELEASE_FUNDS" && providerRow) {
        const j0 = await tx.job.findUnique({ where: { id: job.id } });
        if (!j0.escrowSecondReleaseDone) {
          await paymentService.runSecondTrancheInTransaction(tx, {
            job: j0,
            providerProfileId: providerRow.id,
            jobId: job.id,
          });
          const escrowSettlement = require("./payments/escrowSettlement.service");
          await escrowSettlement.markLaborEscrowFullyReleased(job.id, tx);
        }
        await tx.job.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
        await mutateJobMetaInTransaction(tx, job.id, (m) => {
          const next = { ...m, completionConfirmedByUser: true, disputeId: null, statusOverride: "COMPLETED" };
          next.progressStep = jobProgressUtil.nextMonotonicProgressStep(next, job);
          return next;
        });
      } else if (action === "PARTIAL_REFUND" || action === "FULL_REFUND") {
        const refundGross =
          action === "FULL_REFUND"
            ? Number(job.totalPrice) || Number(job.price) || 0
            : Math.max(0, Number(amount) || 0);
        const metaBefore = normalizeMeta(job.meta);
        const laborNet = disputeGrossToLaborNet(action, refundGross, job, metaBefore);
        const idempotencyKey = `dispute-refund:${dispute.id}:${action}`;

        if (providerRow && job.laborPaid && laborNet > 0) {
          await applyProviderRefundClawbackInTransaction(tx, {
            job,
            providerProfileId: providerRow.id,
            laborRefundNet: laborNet,
            adminUserId,
            idempotencyKey,
            refundKind: "dispute_refund",
            disputeId: dispute.id,
          });
        }

        await tx.job.update({ where: { id: job.id }, data: { status: "CANCELLED" } });
        await mutateJobMetaInTransaction(tx, job.id, (m) => ({
          ...m,
          statusOverride: "CANCELLED",
          disputeId: null,
        }));
        if (providerRow) {
          await providerTrustScore.onRefundResolved(
            providerRow.id,
            action === "FULL_REFUND" ? "FULL_REFUND" : "PARTIAL_REFUND"
          );
          await providerTrustScore.onDisputeLost(providerRow.id);
        }
        await notificationEvents.notifyRefundApproved({
          customerId: dispute.customerId,
          jobId: job.id,
          amount: refundGross,
        });
      } else if (action === "RETURN_PROVIDER") {
        await tx.job.update({ where: { id: job.id }, data: { status: "IN_PROGRESS" } });
        await mutateJobMetaInTransaction(tx, job.id, (m) => ({
          ...m,
          statusOverride: "IN_PROGRESS",
          disputeId: null,
          markedCompleteAt: null,
          confirmationDeadlineAt: null,
          progressStep: 3,
        }));
      } else if (action === "CLOSE_CASE") {
        await mutateJobMetaInTransaction(tx, job.id, (m) => ({
          ...m,
          disputeId: null,
        }));
      }

      await disputeRoundService.closeActiveDisputeRoundInTransaction(tx, dispute.id, {
        action,
        notes,
        providerComment: dispute.providerComment,
        providerImages: dispute.providerImages,
        providerVideos: dispute.providerVideos,
      });

      await tx.jobDispute.update({
        where: { id: dispute.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          adminNotes: notes != null ? notes : dispute.adminNotes,
        },
      });
    },
    { maxWait: 5000, timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  await notificationEvents.notifyCaseClosed({
    customerId: dispute.customerId,
    providerId: dispute.providerId,
    jobId: job.id,
    disputeId: dispute.id,
    action,
  });

  if (action === "PARTIAL_REFUND" || action === "FULL_REFUND") {
    const refundGross =
      action === "FULL_REFUND"
        ? Number(job.totalPrice) || Number(job.price) || 0
        : Math.max(0, Number(amount) || 0);
    const metaBefore = normalizeMeta(job.meta);
    const laborNet = disputeGrossToLaborNet(action, refundGross, job, metaBefore);
    if (laborNet > 0) {
      await processGatewayRefundForJob(job.id, laborNet);
    }
    try {
      if (job.providerId) {
        const metaAfter = await getJobMeta(job.id);
        const clawback = Number(metaAfter?.refund?.clawbackApplied) || 0;
        const debt = Number(metaAfter?.refund?.providerDebtAdded) || 0;
        if (clawback > 0 || debt > 0) {
          await notificationEvents.notifyProviderRefundClawback?.(
            job.providerId,
            job.id,
            clawback,
            debt
          );
        }
      }
    } catch (_e) {
      /* optional */
    }
  }

  await logAudit(AUDIT_ACTIONS.DISPUTE_RESOLVED, {
    userId: adminUserId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.DISPUTE,
    entityId: dispute.id,
    newValue: { action, amount },
  });

  return getDisputeDetail(dispute.id);
}

function urlToLocalPath(url) {
  const s = String(url || "");
  if (s.startsWith("/uploads/")) {
    return path.join(UPLOAD_ROOT, s.replace(/^\/uploads\//, "").replace(/\//g, path.sep));
  }
  if (s.startsWith("/api/files/")) return null;
  return null;
}

async function exportJobCompletionEvidence(jobId) {
  const evidence = await prisma.jobCompletionEvidence.findUnique({ where: { jobId: String(jobId) } });
  if (!evidence) throw new AppError("No completion evidence for this job", 404);

  const manifest = jobCompletionEvidence.toEvidenceDto(evidence);
  const files = [...(evidence.images || []), ...(evidence.videos || [])];

  return { manifest, files, evidence };
}

async function streamEvidenceZip(jobId, res) {
  const { manifest, files } = await exportJobCompletionEvidence(jobId);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="job-${jobId.slice(-8)}-evidence.zip"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

  for (const url of files) {
    const local = urlToLocalPath(url);
    if (local && fs.existsSync(local)) {
      archive.file(local, { name: path.basename(local) });
    }
  }

  await archive.finalize();
}

module.exports = {
  listDisputes,
  getDisputeDetail,
  updateDisputeStatus,
  resolveDispute,
  exportJobCompletionEvidence,
  streamEvidenceZip,
};
