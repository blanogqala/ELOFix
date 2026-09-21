const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { emitDomainUpdate } = require("../utils/realtimeEmitter");
const { getPaymentDueAt, PAYMENT_DUE_DAYS } = require("../config/paymentDue.config");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");
const { mutateJobMetaInTransaction } = require("./jobMeta.service");

const OPEN_STATUSES = ["DUE", "OVERDUE"];
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
    status: row.status,
    source: row.source,
    paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : row.paidAt || null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function deriveDisplayStatus(row, now = new Date()) {
  if (!row) return "NOT_DUE";
  if (row.status === "PAID" || row.status === "CANCELLED") return row.status;
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
  },
  tx = prisma
) {
  const amt = roundMoney(amount);
  if (!(amt > 0)) return null;
  const cid = String(customerId);
  const jid = String(jobId);
  const due = dueAt instanceof Date ? dueAt : getPaymentDueAt();

  const existing = await getOpenObligationForJob(jid, tx);
  if (existing) {
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
  const dueAt = opts.dueAt || getPaymentDueAt();
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
  const open = await getOpenObligationForJob(jobId, tx);
  if (!open) return null;
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

async function clearCustomerMarketplaceRestrictionIfClear(customerId, tx = prisma) {
  const remaining = await tx.customerPaymentObligation.findFirst({
    where: { customerId: String(customerId), status: "OVERDUE" },
    select: { id: true },
  });
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

async function assertCustomerCanStartPaidTransaction(userId) {
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
  MARKETPLACE_RESTRICT_REASON,
  PAYMENT_DUE_DAYS,
  toObligationDto,
  deriveDisplayStatus,
  getOpenObligationForJob,
  customerHasOverdueObligation,
  upsertOpenObligation,
  syncCompletionPaymentDueMeta,
  ensureObligationForJobIfPaymentDue,
  markObligationPaidForJob,
  cancelOpenObligationForJob,
  applyCustomerMarketplaceRestriction,
  clearCustomerMarketplaceRestrictionIfClear,
  afterObligationPaid,
  assertCustomerMarketplaceNotRestricted,
  assertCustomerCanStartPaidTransaction,
  listOpenObligationsForAdmin,
};
