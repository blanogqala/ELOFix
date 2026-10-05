const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { emitDomainUpdate } = require("../utils/realtimeEmitter");
const { getPaymentDueAt, PAYMENT_DUE_DAYS } = require("../config/paymentDue.config");
const { recoveryDueAtFrom } = require("../utils/completionDeadline.util");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");
const { mutateJobMetaInTransaction } = require("./jobMeta.service");

const OPEN_STATUSES = ["DUE", "OVERDUE"];
const ACTIVE_OR_PAUSED_STATUSES = ["DUE", "OVERDUE", "PAUSED"];
const MARKETPLACE_RESTRICT_REASON =
  "An outstanding service payment is overdue. New marketplace transactions are restricted until the balance is settled.";

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function toObligationDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customerId,
    jobId: row.jobId,
    disputeId: row.disputeId || null,
    amountDue: roundMoney(row.amount),
    dueAt: row.dueAt instanceof Date ? row.dueAt.toISOString() : row.dueAt,
    restrictionStartsAt:
      row.restrictionStartsAt instanceof Date
        ? row.restrictionStartsAt.toISOString()
        : row.restrictionStartsAt || null,
    status: row.status,
    source: row.source,
    paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : row.paidAt || null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function deriveDisplayStatus(row, now = new Date()) {
  if (!row) return "NOT_DUE";
  if (row.status === "PAID" || row.status === "CANCELLED" || row.status === "PAUSED") return row.status;
  if (row.status === "OVERDUE") return "OVERDUE";
  if (row.dueAt && new Date(row.dueAt).getTime() <= now.getTime()) return "OVERDUE";
  return "DUE";
}

async function getOpenObligationForJob(jobId, tx = prisma) {
  return tx.customerPaymentObligation.findFirst({
    where: { jobId: String(jobId), status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
}

async function getOpenOrPausedObligationForJob(jobId, tx = prisma) {
  return tx.customerPaymentObligation.findFirst({
    where: { jobId: String(jobId), status: { in: ACTIVE_OR_PAUSED_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
}

async function getPausedObligationForJob(jobId, tx = prisma) {
  return tx.customerPaymentObligation.findFirst({
    where: { jobId: String(jobId), status: "PAUSED" },
    orderBy: { createdAt: "desc" },
  });
}

function isoOrNull(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function customerHasOverdueObligation(customerId, tx = prisma) {
  const overdue = await tx.customerPaymentObligation.findFirst({
    where: { customerId: String(customerId), status: "OVERDUE" },
    select: { id: true },
  });
  return Boolean(overdue);
}

/**
 * Create or refresh an open customer labor obligation. Idempotent per job while open.
 */
async function upsertOpenObligation(
  {
    customerId,
    jobId,
    amount,
    dueAt,
    source = "COMPLETION_WORKFLOW",
    disputeId = null,
    restrictionStartsAt = null,
  },
  tx = prisma
) {
  const amt = roundMoney(amount);
  if (!(amt > 0)) return null;
  const cid = String(customerId);
  const jid = String(jobId);
  const due = dueAt instanceof Date ? dueAt : getPaymentDueAt();

  const existing = await getOpenOrPausedObligationForJob(jid, tx);
  if (existing) {
    if (existing.status === "PAUSED") {
      return existing;
    }
    const updated = await tx.customerPaymentObligation.update({
      where: { id: existing.id },
      data: {
        amount: amt,
        disputeId: disputeId || existing.disputeId,
        source: source || existing.source,
      },
    });
    return updated;
  }

  const created = await tx.customerPaymentObligation.create({
    data: {
      id: randomUUID(),
      customerId: cid,
      jobId: jid,
      disputeId: disputeId || null,
      amount: amt,
      dueAt: due,
      status: "DUE",
      source,
      restrictionStartsAt: restrictionStartsAt instanceof Date ? restrictionStartsAt : restrictionStartsAt || null,
    },
  });

  return created;
}

async function syncCompletionPaymentDueMeta(tx, jobId, obligation) {
  await mutateJobMetaInTransaction(tx, jobId, (m) => {
    if (!obligation || obligation.status === "PAID" || obligation.status === "CANCELLED") {
      return { ...m, completionPaymentDue: null };
    }
    return {
      ...m,
      completionPaymentDue: {
        amountDue: roundMoney(obligation.amount),
        dueAt: obligation.dueAt instanceof Date ? obligation.dueAt.toISOString() : obligation.dueAt,
        restrictionStartsAt: isoOrNull(obligation.restrictionStartsAt),
        status: obligation.status,
        obligationId: obligation.id,
        source: obligation.source,
        createdAt: obligation.createdAt instanceof Date ? obligation.createdAt.toISOString() : obligation.createdAt,
        notifiedAt: m.completionPaymentDue?.notifiedAt || new Date().toISOString(),
        resolutionLogId: m.completionPaymentDue?.resolutionLogId || null,
      },
    };
  });
}

/**
 * If the job currently requires a COMPLETION / FULL_COMPLETION labor payment, open a 30-day obligation.
 */
async function ensureObligationForJobIfPaymentDue(job, meta = {}, opts = {}) {
  const paymentModeService = require("./payments/paymentMode.service");
  if (!job || job.legacyEscrowV2) return null;
  const dueType = paymentModeService.resolveNextLaborPaymentType(job, meta);
  if (dueType !== paymentModeService.PAYMENT_TYPES.COMPLETION && dueType !== paymentModeService.PAYMENT_TYPES.FULL_COMPLETION) {
    return null;
  }
  const expected = paymentModeService.expectedAmountForLaborPaymentType(job, dueType);
  const amount = roundMoney(expected);
  if (!(amount > 0)) return null;

  const source = opts.source || "COMPLETION_WORKFLOW";
  const mode = String(job.paymentModeSnapshot || "");
  const useCompletionWindow =
    source === "COMPLETION_WORKFLOW" &&
    !job.legacyEscrowV2 &&
    mode === "TWO_PAYMENT_50_50" &&
    Boolean(meta?.confirmationDeadlineAt);
  let restrictionStartsAt = opts.restrictionStartsAt || null;
  let dueAt = opts.dueAt || null;
  if (useCompletionWindow) {
    const deadline = new Date(meta.confirmationDeadlineAt);
    if (!restrictionStartsAt) restrictionStartsAt = deadline;
    if (!dueAt) dueAt = recoveryDueAtFrom(deadline);
  }
  if (!dueAt) dueAt = getPaymentDueAt();
  const notificationEvents = require("./notificationEvents.service");

  const { obligation, created } = await prisma.$transaction(async (tx) => {
    const before = await getOpenObligationForJob(job.id, tx);
    const row = await upsertOpenObligation(
      {
        customerId: job.customerId,
        jobId: job.id,
        amount,
        dueAt,
        source,
        disputeId: opts.disputeId || null,
        restrictionStartsAt: restrictionStartsAt || null,
      },
      tx
    );
    await syncCompletionPaymentDueMeta(tx, job.id, row);
    return { obligation: row, created: !before };
  });

  if (created && obligation) {
    await logAudit(AUDIT_ACTIONS.PAYMENT_OBLIGATION_CREATED, {
      actorType: ACTOR_TYPES.SYSTEM,
      userId: job.customerId,
      entityType: ENTITY_TYPES.JOB,
      entityId: String(job.id),
      newValue: {
        obligationId: obligation.id,
        amount: roundMoney(obligation.amount),
        dueAt: obligation.dueAt instanceof Date ? obligation.dueAt.toISOString() : obligation.dueAt,
        source,
      },
    });
    await notificationEvents.notifyCustomerPaymentObligationCreated({
      customerId: job.customerId,
      jobId: job.id,
      amount: roundMoney(obligation.amount),
      dueAt: obligation.dueAt,
      jobTitle: job.title,
    });
    emitDomainUpdate({
      domain: "payment",
      action: "obligation-created",
      jobId: job.id,
      entityId: obligation.id,
      userIds: [job.customerId],
    });
  }
  return obligation;
}

async function markObligationPaidForJob(jobId, tx = prisma) {
  const open = await getOpenObligationForJob(jobId, tx);
  if (!open) {
    await mutateJobMetaInTransaction(tx, jobId, (m) => ({ ...m, completionPaymentDue: null }));
    return null;
  }
  const paid = await tx.customerPaymentObligation.update({
    where: { id: open.id },
    data: { status: "PAID", paidAt: new Date() },
  });
  await mutateJobMetaInTransaction(tx, jobId, (m) => ({ ...m, completionPaymentDue: null }));
  emitDomainUpdate({
    domain: "payment",
    action: "obligation-paid",
    jobId: String(jobId),
    entityId: paid.id,
    userIds: [paid.customerId].filter(Boolean),
    adminRoom: true,
  });
  return paid;
}

async function cancelOpenObligationForJob(jobId, tx = prisma) {
  const open = await getOpenOrPausedObligationForJob(jobId, tx);
  if (!open) {
    await mutateJobMetaInTransaction(tx, jobId, (m) =>
      m?.completionPaymentDue ? { ...m, completionPaymentDue: null } : m
    );
    return null;
  }
  const cancelled = await tx.customerPaymentObligation.update({
    where: { id: open.id },
    data: { status: "CANCELLED" },
  });
  await mutateJobMetaInTransaction(tx, jobId, (m) => ({ ...m, completionPaymentDue: null }));
  emitDomainUpdate({
    domain: "payment",
    action: "obligation-cancelled",
    jobId: String(jobId),
    entityId: cancelled.id,
    userIds: [cancelled.customerId].filter(Boolean),
  });
  return cancelled;
}

/**
 * Remaining labor is not payable while a dispute/cancellation case is open.
 * Pauses the workflow obligation so the original restriction start and recovery due date can resume.
 * A paused row does not count toward marketplace restriction.
 */
async function pauseWorkflowObligationForOpenCase(jobId, customerId, tx = prisma) {
  const open = await getOpenObligationForJob(jobId, tx);
  let paused = null;
  if (open) {
    paused = await tx.customerPaymentObligation.update({
      where: { id: open.id },
      data: { status: "PAUSED" },
    });
  } else {
    paused = await getPausedObligationForJob(jobId, tx);
  }
  await mutateJobMetaInTransaction(tx, jobId, (m) =>
    m?.completionPaymentDue ? { ...m, completionPaymentDue: null } : m
  );
  if (customerId) {
    await clearCustomerMarketplaceRestrictionIfClear(customerId, tx);
  }
  return paused;
}

async function cancelWorkflowObligationForOpenCase(jobId, customerId, tx = prisma) {
  return pauseWorkflowObligationForOpenCase(jobId, customerId, tx);
}

/**
 * Resume a paused obligation with its original timestamps.
 * Does not revive a CANCELLED row and does not grant a fresh deadline.
 */
async function resumePausedObligation(jobId, tx = prisma, now = new Date()) {
  const paused = await getPausedObligationForJob(jobId, tx);
  if (!paused) return null;
  const duePassed = new Date(paused.dueAt).getTime() <= now.getTime();
  const resumed = await tx.customerPaymentObligation.update({
    where: { id: paused.id },
    data: { status: duePassed ? "OVERDUE" : "DUE" },
  });
  await syncCompletionPaymentDueMeta(tx, jobId, resumed);
  return resumed;
}

async function isJobUnderOpenCase(jobId, tx = prisma) {
  const id = String(jobId || "").trim();
  if (!id) return false;
  const openCase = await tx.jobDispute.findFirst({
    where: { jobId: id, status: { in: ["OPEN", "UNDER_INVESTIGATION"] } },
    select: { id: true },
  });
  return Boolean(openCase);
}

/**
 * Drop workflow obligations on jobs still in dispute, then lift restriction if nothing else is overdue.
 */
async function reconcileCustomerMarketplaceRestriction(customerId) {
  const cid = String(customerId || "").trim();
  if (!cid) return false;
  const open = await prisma.customerPaymentObligation.findMany({
    where: { customerId: cid, status: { in: OPEN_STATUSES } },
    select: { jobId: true },
  });
  for (const row of open) {
    if (await isJobUnderOpenCase(row.jobId)) {
      await pauseWorkflowObligationForOpenCase(row.jobId, cid);
    }
  }
  return clearCustomerMarketplaceRestrictionIfClear(cid);
}

async function applyCustomerMarketplaceRestriction(customerId, reason, tx = prisma) {
  const user = await tx.user.findUnique({
    where: { id: String(customerId) },
    select: { id: true, marketplaceRestricted: true },
  });
  if (!user) return false;
  if (user.marketplaceRestricted) return false;
  await tx.user.update({
    where: { id: user.id },
    data: {
      marketplaceRestricted: true,
      marketplaceRestrictedAt: new Date(),
      marketplaceRestrictedReason: reason || MARKETPLACE_RESTRICT_REASON,
    },
  });
  await logAudit(AUDIT_ACTIONS.CUSTOMER_PAYMENT_RESTRICTION_APPLIED, {
    actorType: ACTOR_TYPES.SYSTEM,
    userId: user.id,
    entityType: ENTITY_TYPES.USER,
    entityId: user.id,
    newValue: { reason: reason || MARKETPLACE_RESTRICT_REASON },
  });
  emitDomainUpdate({
    domain: "profile",
    action: "restricted",
    entityId: user.id,
    userIds: [user.id],
    adminRoom: true,
  });
  return true;
}

function obligationQualifiesForRestriction(row, now = new Date()) {
  if (!row) return false;
  if (row.status === "OVERDUE") return true;
  if (row.status === "DUE" && row.restrictionStartsAt) {
    return new Date(row.restrictionStartsAt).getTime() <= now.getTime();
  }
  return false;
}

async function customerHasQualifyingUnpaidObligation(customerId, tx = prisma, now = new Date()) {
  const rows = await tx.customerPaymentObligation.findMany({
    where: { customerId: String(customerId), status: { in: OPEN_STATUSES } },
    select: { id: true, status: true, restrictionStartsAt: true, dueAt: true },
  });
  return rows.some((row) => obligationQualifiesForRestriction(row, now));
}

async function clearCustomerMarketplaceRestrictionIfClear(customerId, tx = prisma) {
  const remaining = await customerHasQualifyingUnpaidObligation(customerId, tx);
  if (remaining) return false;
  const user = await tx.user.findUnique({
    where: { id: String(customerId) },
    select: { id: true, marketplaceRestricted: true },
  });
  if (!user?.marketplaceRestricted) return false;
  await tx.user.update({
    where: { id: user.id },
    data: {
      marketplaceRestricted: false,
      marketplaceRestrictedAt: null,
      marketplaceRestrictedReason: null,
    },
  });
  await logAudit(AUDIT_ACTIONS.CUSTOMER_PAYMENT_RESTRICTION_CLEARED, {
    actorType: ACTOR_TYPES.SYSTEM,
    userId: user.id,
    entityType: ENTITY_TYPES.USER,
    entityId: user.id,
    newValue: { cleared: true },
  });
  emitDomainUpdate({
    domain: "profile",
    action: "unrestricted",
    entityId: user.id,
    userIds: [user.id],
    adminRoom: true,
  });
  return true;
}

async function afterObligationPaid(customerId) {
  const notificationEvents = require("./notificationEvents.service");
  const cleared = await clearCustomerMarketplaceRestrictionIfClear(customerId);
  if (cleared) {
    await notificationEvents.notifyCustomerPaymentRestrictionCleared(customerId);
  }
}

function assertCustomerMarketplaceNotRestricted(user) {
  if (!user?.marketplaceRestricted) return;
  throw new AppError(
    user.marketplaceRestrictedReason || MARKETPLACE_RESTRICT_REASON,
    403
  );
}

/**
 * Marketplace restriction only. Does not change User.blocked and does not add a legal-acceptance gate.
 */
async function assertCustomerMarketplaceSpendAllowed(userId) {
  await reconcileCustomerMarketplaceRestriction(userId);
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { marketplaceRestricted: true, marketplaceRestrictedReason: true },
  });
  assertCustomerMarketplaceNotRestricted(user);
  return user;
}

async function assertCustomerCanStartPaidTransaction(userId) {
  await reconcileCustomerMarketplaceRestriction(userId);
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: {
      blocked: true,
      marketplaceRestricted: true,
      marketplaceRestrictedReason: true,
      role: true,
    },
  });
  const { assertCustomerNotBlocked } = require("./accountStatus.service");
  assertCustomerNotBlocked(user);
  assertCustomerMarketplaceNotRestricted(user);
  const { assertLegalCurrent } = require("./legalAcceptance.service");
  await assertLegalCurrent(userId, user?.role || "CUSTOMER");
  return user;
}

async function listOpenObligationsForAdmin({ status, overdueOnly } = {}) {
  const where = {};
  if (overdueOnly) where.status = "OVERDUE";
  else if (status) where.status = String(status).toUpperCase();
  else where.status = { in: OPEN_STATUSES };

  const rows = await prisma.customerPaymentObligation.findMany({
    where,
    orderBy: { dueAt: "asc" },
    take: 200,
    include: {
      customer: { select: { id: true, name: true, email: true, marketplaceRestricted: true } },
      job: { select: { id: true, title: true, status: true } },
    },
  });
  return rows.map((row) => ({
    ...toObligationDto(row),
    displayStatus: deriveDisplayStatus(row),
    customerName: row.customer?.name || null,
    customerEmail: row.customer?.email || null,
    marketplaceRestricted: Boolean(row.customer?.marketplaceRestricted),
    jobTitle: row.job?.title || null,
    jobStatus: row.job?.status || null,
    dueDays: PAYMENT_DUE_DAYS,
  }));
}

module.exports = {
  OPEN_STATUSES,
  ACTIVE_OR_PAUSED_STATUSES,
  MARKETPLACE_RESTRICT_REASON,
  PAYMENT_DUE_DAYS,
  toObligationDto,
  deriveDisplayStatus,
  getOpenObligationForJob,
  getOpenOrPausedObligationForJob,
  getPausedObligationForJob,
  customerHasOverdueObligation,
  obligationQualifiesForRestriction,
  customerHasQualifyingUnpaidObligation,
  upsertOpenObligation,
  syncCompletionPaymentDueMeta,
  ensureObligationForJobIfPaymentDue,
  markObligationPaidForJob,
  cancelOpenObligationForJob,
  pauseWorkflowObligationForOpenCase,
  cancelWorkflowObligationForOpenCase,
  resumePausedObligation,
  isJobUnderOpenCase,
  reconcileCustomerMarketplaceRestriction,
  applyCustomerMarketplaceRestriction,
  clearCustomerMarketplaceRestrictionIfClear,
  afterObligationPaid,
  assertCustomerMarketplaceNotRestricted,
  assertCustomerMarketplaceSpendAllowed,
  assertCustomerCanStartPaidTransaction,
  listOpenObligationsForAdmin,
};
