const prisma = require("../config/prisma");
const notificationEvents = require("../services/notificationEvents.service");
const { logAudit } = require("../services/auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const { getRefundDebtDueMs } = require("../config/refundRecovery.config");
const BATCH_SIZE = 100;

const REFUND_DEBT_BLOCK_REASON =
  "Outstanding refund debt payment is overdue. Pay the amount owed and contact support, or submit repayment for admin review.";

function daysBetween(a, b) {
  return Math.ceil((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

async function processRefundDebtEnforcement() {
  const stats = { scanned: 0, reminders: 0, blocked: 0, errors: 0 };
  const now = new Date();

  let recoveries;
  try {
    recoveries = await prisma.refundRecovery.findMany({
      where: { status: { in: ["PENDING", "PARTIALLY_RECOVERED", "OVERDUE"] } },
      take: BATCH_SIZE,
      orderBy: { dueAt: "asc" },
      include: {
        provider: { include: { user: { select: { id: true } } } },
        job: { select: { id: true, customerId: true } },
      },
    });
  } catch (e) {
    console.warn("[refundDebtEnforcement] query failed", e?.message || e);
    return stats;
  }

  for (const row of recoveries) {
    stats.scanned++;
    try {
      const balance = Number(row.totalPending) - Number(row.recoveredAmount);
      if (balance <= 0.01) continue;

      const dueAt = new Date(row.dueAt);
      const daysLeft = daysBetween(now, dueAt);

      if (dueAt > now) {
        if (daysLeft <= 7 && !row.reminder7SentAt) {
          await notificationEvents.notifyProviderRefundDebtReminder(row.provider.userId, {
            daysLeft,
            amountOwed: balance,
            dueAt: row.dueAt,
            reference: row.reference,
          });
          await prisma.refundRecovery.update({
            where: { id: row.id },
            data: { reminder7SentAt: now },
          });
          stats.reminders++;
        } else if (daysLeft <= 1 && !row.reminder1SentAt) {
          await notificationEvents.notifyProviderRefundDebtReminder(row.provider.userId, {
            daysLeft: Math.max(1, daysLeft),
            amountOwed: balance,
            dueAt: row.dueAt,
            reference: row.reference,
          });
          await prisma.refundRecovery.update({
            where: { id: row.id },
            data: { reminder1SentAt: now },
          });
          stats.reminders++;
        }
        continue;
      }

      const alreadyOverdue = String(row.status) === "OVERDUE";
      const alreadyBlocked = Boolean(row.provider?.refundDebtBlockedAt) && Boolean(row.provider?.blocked);

      await prisma.$transaction(async (tx) => {
        await tx.refundRecovery.update({
          where: { id: row.id },
          data: {
            status: "OVERDUE",
            legalActionAt: row.legalActionAt || now,
            updatedAt: now,
          },
        });
        if (!alreadyBlocked) {
          await tx.provider.update({
            where: { id: row.providerId },
            data: {
              blocked: true,
              blockedReason: REFUND_DEBT_BLOCK_REASON,
              blockedAt: row.provider?.blockedAt || now,
              refundDebtBlockedAt: row.provider?.refundDebtBlockedAt || now,
            },
          });
        }
      });

      if (!alreadyOverdue) {
        await notificationEvents.notifyProviderRefundDebtOverdue(row.provider.userId, balance);
        await notificationEvents.notifyAccountBlocked(row.provider.user.id, REFUND_DEBT_BLOCK_REASON);
        await notificationEvents.notifyAdminRefundDebtOverdue(row.provider.userId, balance);
        if (row.job?.customerId) {
          await notificationEvents.notifyCustomerRefundDebtOverdue(
            row.job.customerId,
            row.job.id,
            balance
          );
        }
        await logAudit(AUDIT_ACTIONS.PROVIDER_REPAYMENT_OVERDUE, {
          actorType: ACTOR_TYPES.SYSTEM,
          entityType: ENTITY_TYPES.PROVIDER,
          entityId: row.providerId,
          newValue: { recoveryId: row.id, balance },
        });
        if (!alreadyBlocked) {
          await logAudit(AUDIT_ACTIONS.PROVIDER_RESTRICTION_APPLIED, {
            actorType: ACTOR_TYPES.SYSTEM,
            entityType: ENTITY_TYPES.PROVIDER,
            entityId: row.providerId,
            newValue: { reason: "overdue_refund_debt", recoveryId: row.id, balance },
          });
        }
        stats.blocked++;
      }
    } catch (e) {
      stats.errors++;
      console.error("[refundDebtEnforcement] row failed", row.id, e?.message || e);
    }
  }

  if (stats.reminders > 0 || stats.blocked > 0 || stats.errors > 0) {
    console.log("[refundDebtEnforcement] tick summary", stats);
  }
  return stats;
}

function startRefundDebtEnforcementJob() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DISABLE_REFUND_DEBT_ENFORCEMENT_CRON === "true"
  ) {
    console.log("[refundDebtEnforcement] cron disabled");
    return () => {};
  }
  const tick = () => {
    processRefundDebtEnforcement().catch((err) => {
      console.error("[refundDebtEnforcement] tick error", err);
    });
  };
  const intervalMs =
    process.env.NODE_ENV === "development" && getRefundDebtDueMs() < ONE_HOUR_MS
      ? ONE_MINUTE_MS
      : ONE_HOUR_MS;
  const id = setInterval(tick, intervalMs);
  if (typeof id.unref === "function") id.unref();
  tick();
  return () => clearInterval(id);
}

module.exports = {
  startRefundDebtEnforcementJob,
  processRefundDebtEnforcement,
};
