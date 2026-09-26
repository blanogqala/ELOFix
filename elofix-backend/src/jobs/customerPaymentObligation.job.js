const prisma = require("../config/prisma");
const { logAudit } = require("../services/auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");
const obligationService = require("../services/customerPaymentObligation.service");
const notificationEvents = require("../services/notificationEvents.service");
const { getPaymentDueMs } = require("../config/paymentDue.config");

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const BATCH_SIZE = 100;

function daysBetween(a, b) {
  return Math.ceil((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

async function processCustomerPaymentObligations() {
  const stats = { scanned: 0, reminders: 0, overdue: 0, errors: 0 };
  const now = new Date();

  let rows;
  try {
    rows = await prisma.customerPaymentObligation.findMany({
      where: { status: { in: ["DUE", "OVERDUE"] } },
      take: BATCH_SIZE,
      orderBy: { dueAt: "asc" },
      include: {
        job: { select: { id: true, title: true, customerId: true, status: true, meta: true } },
      },
    });
  } catch (e) {
    console.warn("[customerPaymentObligation] query failed", e?.message || e);
    return stats;
  }

  for (const row of rows) {
    stats.scanned++;
    try {
      const amount = Number(row.amount);
      if (!(amount > 0.01)) continue;
      if (row.jobId && (await obligationService.isJobUnderOpenCase(row.jobId))) {
        await obligationService.cancelWorkflowObligationForOpenCase(row.jobId, row.customerId);
        continue;
      }
      const dueAt = new Date(row.dueAt);
      const daysLeft = daysBetween(now, dueAt);

      if (dueAt > now) {
        if (row.status !== "DUE") continue;
        if (daysLeft <= 7 && !row.reminder7SentAt) {
          await notificationEvents.notifyCustomerPaymentObligationReminder({
            customerId: row.customerId,
            jobId: row.jobId,
            amount,
            dueAt: row.dueAt,
            daysLeft,
          });
          await prisma.customerPaymentObligation.update({
            where: { id: row.id },
            data: { reminder7SentAt: now },
          });
          stats.reminders++;
        } else if (daysLeft <= 1 && !row.reminder1SentAt) {
          await notificationEvents.notifyCustomerPaymentObligationReminder({
            customerId: row.customerId,
            jobId: row.jobId,
            amount,
            dueAt: row.dueAt,
            daysLeft: Math.max(1, daysLeft),
          });
          await prisma.customerPaymentObligation.update({
            where: { id: row.id },
            data: { reminder1SentAt: now },
          });
          stats.reminders++;
        }
        continue;
      }

      const alreadyNotified = Boolean(row.overdueNotifiedAt);
      const alreadyRestricted = Boolean(row.restrictionAppliedAt);
      const openStatuses = obligationService.OPEN_STATUSES;

      let claimed = false;
      await prisma.$transaction(async (tx) => {
        if (row.jobId && (await obligationService.isJobUnderOpenCase(row.jobId, tx))) {
          await obligationService.cancelWorkflowObligationForOpenCase(row.jobId, row.customerId, tx);
          return;
        }
        // Claim only while the row is still open. A payment or dispute cancel that
        // committed after this batch was loaded must not be overwritten with OVERDUE.
        const claimedUpdate = await tx.customerPaymentObligation.updateMany({
          where: { id: row.id, status: { in: openStatuses } },
          data: {
            status: "OVERDUE",
            ...(!alreadyRestricted ? { restrictionAppliedAt: row.restrictionAppliedAt || now } : {}),
          },
        });
        if (claimedUpdate.count !== 1) return;
        claimed = true;
        await obligationService.applyCustomerMarketplaceRestriction(
          row.customerId,
          obligationService.MARKETPLACE_RESTRICT_REASON,
          tx
        );
        await obligationService.syncCompletionPaymentDueMeta(tx, row.jobId, {
          ...row,
          status: "OVERDUE",
          restrictionAppliedAt: row.restrictionAppliedAt || now,
        });
      });

      if (!claimed) continue;

      if (!alreadyNotified) {
        const stamped = await prisma.customerPaymentObligation.updateMany({
          where: { id: row.id, status: { in: openStatuses }, overdueNotifiedAt: null },
          data: { overdueNotifiedAt: now, status: "OVERDUE" },
        });
        if (stamped.count === 1) {
          await notificationEvents.notifyCustomerPaymentOverdue({
            customerId: row.customerId,
            jobId: row.jobId,
            amount,
          });
          await notificationEvents.notifyAdminCustomerPaymentOverdue({
            customerId: row.customerId,
            jobId: row.jobId,
            amount,
          });
          await logAudit(AUDIT_ACTIONS.PAYMENT_OBLIGATION_OVERDUE, {
            actorType: ACTOR_TYPES.SYSTEM,
            userId: row.customerId,
            entityType: ENTITY_TYPES.JOB,
            entityId: row.jobId,
            newValue: { obligationId: row.id, amount },
          });
          stats.overdue++;
        }
      }
    } catch (e) {
      stats.errors++;
      console.error("[customerPaymentObligation] row failed", row.id, e?.message || e);
    }
  }

  if (stats.reminders > 0 || stats.overdue > 0 || stats.errors > 0) {
    console.log("[customerPaymentObligation] tick summary", stats);
  }
  return stats;
}

function startCustomerPaymentObligationJob() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DISABLE_CUSTOMER_PAYMENT_OBLIGATION_CRON === "true"
  ) {
    console.log("[customerPaymentObligation] cron disabled");
    return () => {};
  }
  const tick = () => {
    processCustomerPaymentObligations().catch((err) => {
      console.error("[customerPaymentObligation] tick error", err);
    });
  };
  const intervalMs =
    process.env.NODE_ENV === "development" && getPaymentDueMs() < ONE_HOUR_MS
      ? ONE_MINUTE_MS
      : ONE_HOUR_MS;
  const id = setInterval(tick, intervalMs);
  if (typeof id.unref === "function") id.unref();
  tick();
  return () => clearInterval(id);
}

module.exports = {
  startCustomerPaymentObligationJob,
  processCustomerPaymentObligations,
};
