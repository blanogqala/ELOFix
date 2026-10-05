const prisma = require("../config/prisma");
const { logAudit } = require("../services/auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");
const obligationService = require("../services/customerPaymentObligation.service");
const notificationEvents = require("../services/notificationEvents.service");
const { getPaymentDueMs } = require("../config/paymentDue.config");
const { withAdvisoryLock } = require("../utils/workerLock.util");

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const BATCH_SIZE = 100;
const MAX_BATCHES = 20;
const LOCK_KEY = 814202;

let running = false;
let cursorId = null;

function daysBetween(a, b) {
  return Math.ceil((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

async function sendWindowExpiredNotice(row) {
  const amount = Number(row.amount);
  await notificationEvents.notifyConfirmationWindowExpired({
    customerId: row.customerId,
    providerId: row.job?.providerId || null,
    jobId: row.jobId,
    jobTitle: row.job?.title || null,
    amount,
  });
}

async function sendOverdueNotice(row) {
  const amount = Number(row.amount);
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
}

async function maybeSendReminders(row, now, stats) {
  if (row.status !== "DUE") return;
  const dueAt = new Date(row.dueAt);
  if (dueAt <= now) return;
  const amount = Number(row.amount);
  const daysLeft = daysBetween(now, dueAt);
  if (daysLeft <= 7 && !row.reminder7SentAt) {
    await notificationEvents.notifyCustomerPaymentObligationReminder({
      customerId: row.customerId,
      jobId: row.jobId,
      amount,
      dueAt: row.dueAt,
      daysLeft,
    });
    await prisma.customerPaymentObligation.updateMany({
      where: { id: row.id, reminder7SentAt: null, status: "DUE" },
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
    await prisma.customerPaymentObligation.updateMany({
      where: { id: row.id, reminder1SentAt: null, status: "DUE" },
      data: { reminder1SentAt: now },
    });
    stats.reminders++;
  }
}

async function enforceLegacyDue(row, now, stats) {
  const dueAt = new Date(row.dueAt);
  if (dueAt > now) {
    await maybeSendReminders(row, now, stats);
    return;
  }

  const alreadyNotified = Boolean(row.overdueNotifiedAt);
  let becameOverdue = false;

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.customerPaymentObligation.findUnique({ where: { id: row.id } });
    if (!fresh || !["DUE", "OVERDUE"].includes(fresh.status)) return;
    if (fresh.restrictionStartsAt) return;
    if (await obligationService.isJobUnderOpenCase(fresh.jobId, tx)) {
      await obligationService.pauseWorkflowObligationForOpenCase(fresh.jobId, fresh.customerId, tx);
      return;
    }
    const job = await tx.job.findUnique({
      where: { id: fresh.jobId },
      select: { paymentProgress: true, status: true },
    });
    if (!job || job.paymentProgress === "FULLY_PAID" || job.status === "COMPLETED" || job.status === "CANCELLED") {
      return;
    }
    if (new Date(fresh.dueAt) > now) return;

    if (fresh.status !== "OVERDUE") {
      const flipped = await tx.customerPaymentObligation.updateMany({
        where: { id: fresh.id, status: "DUE" },
        data: { status: "OVERDUE" },
      });
      if (flipped.count === 1) becameOverdue = true;
    }
    await obligationService.applyCustomerMarketplaceRestriction(
      fresh.customerId,
      obligationService.MARKETPLACE_RESTRICT_REASON,
      tx
    );
    await tx.customerPaymentObligation.updateMany({
      where: { id: fresh.id, status: "OVERDUE", restrictionAppliedAt: null },
      data: { restrictionAppliedAt: fresh.restrictionAppliedAt || now },
    });
    await obligationService.syncCompletionPaymentDueMeta(tx, fresh.jobId, {
      ...fresh,
      status: "OVERDUE",
      restrictionAppliedAt: fresh.restrictionAppliedAt || now,
    });
  });

  if (!alreadyNotified && becameOverdue) {
    const stamped = await prisma.customerPaymentObligation.updateMany({
      where: { id: row.id, status: "OVERDUE", overdueNotifiedAt: null },
      data: { overdueNotifiedAt: now },
    });
    if (stamped.count === 1) {
      await sendOverdueNotice(row);
      stats.overdue++;
    }
  } else if (!alreadyNotified && row.status === "OVERDUE") {
    const stamped = await prisma.customerPaymentObligation.updateMany({
      where: { id: row.id, overdueNotifiedAt: null },
      data: { overdueNotifiedAt: now },
    });
    if (stamped.count === 1) {
      await sendOverdueNotice(row);
      stats.overdue++;
    }
  }
}

async function enforceCompletionWindow(row, now, stats) {
  const actions = await prisma.$transaction(async (tx) => {
    const fresh = await tx.customerPaymentObligation.findUnique({ where: { id: row.id } });
    if (!fresh || !["DUE", "OVERDUE"].includes(fresh.status)) return null;
    if (!fresh.restrictionStartsAt) return null;
    if (await obligationService.isJobUnderOpenCase(fresh.jobId, tx)) {
      await obligationService.pauseWorkflowObligationForOpenCase(fresh.jobId, fresh.customerId, tx);
      return { paused: true };
    }
    const job = await tx.job.findUnique({
      where: { id: fresh.jobId },
      select: { paymentProgress: true, status: true, providerId: true, title: true },
    });
    if (!job || job.paymentProgress === "FULLY_PAID" || job.status === "COMPLETED" || job.status === "CANCELLED") {
      return null;
    }

    const out = { windowExpired: false, overdue: false, fresh, job };
    const windowStarted = new Date(fresh.restrictionStartsAt) <= now;
    if (windowStarted) {
      await obligationService.applyCustomerMarketplaceRestriction(
        fresh.customerId,
        obligationService.MARKETPLACE_RESTRICT_REASON,
        tx
      );
      if (!fresh.windowExpiredNotifiedAt) {
        const stamped = await tx.customerPaymentObligation.updateMany({
          where: {
            id: fresh.id,
            status: { in: ["DUE", "OVERDUE"] },
            windowExpiredNotifiedAt: null,
          },
          data: {
            windowExpiredNotifiedAt: now,
            restrictionAppliedAt: fresh.restrictionAppliedAt || now,
          },
        });
        if (stamped.count === 1) out.windowExpired = true;
      } else if (!fresh.restrictionAppliedAt) {
        await tx.customerPaymentObligation.updateMany({
          where: { id: fresh.id, restrictionAppliedAt: null },
          data: { restrictionAppliedAt: now },
        });
      }
    }

    if (new Date(fresh.dueAt) <= now && !fresh.overdueNotifiedAt) {
      const stamped = await tx.customerPaymentObligation.updateMany({
        where: {
          id: fresh.id,
          status: { in: ["DUE", "OVERDUE"] },
          overdueNotifiedAt: null,
        },
        data: { status: "OVERDUE", overdueNotifiedAt: now },
      });
      if (stamped.count === 1) out.overdue = true;
    }

    if (out.windowExpired || out.overdue) {
      const latest = await tx.customerPaymentObligation.findUnique({ where: { id: fresh.id } });
      await obligationService.syncCompletionPaymentDueMeta(tx, fresh.jobId, latest);
    }
    return out;
  });

  if (!actions || actions.paused) return;
  if (actions.windowExpired) {
    await sendWindowExpiredNotice({ ...row, job: actions.job || row.job });
    stats.windowExpired++;
  }
  if (actions.overdue) {
    await sendOverdueNotice(row);
    stats.overdue++;
  }
  if (!actions.windowExpired && !actions.overdue && new Date(row.dueAt) > now) {
    await maybeSendReminders(row, now, stats);
  }
}

async function processCustomerPaymentObligations(opts = {}) {
  if (running) return { scanned: 0, reminders: 0, overdue: 0, windowExpired: 0, errors: 0, skipped: true };
  const batchSize = opts.batchSize || BATCH_SIZE;
  const maxBatches = opts.maxBatches || MAX_BATCHES;
  running = true;
  let lockResult;
  try {
    lockResult = await withAdvisoryLock(LOCK_KEY, () => runObligationPass(opts, batchSize, maxBatches));
  } catch (e) {
    console.warn("[customerPaymentObligation] lock failed", e?.message || e);
    return { scanned: 0, reminders: 0, overdue: 0, windowExpired: 0, errors: 0, skipped: true };
  } finally {
    running = false;
  }
  if (!lockResult?.locked) {
    return { scanned: 0, reminders: 0, overdue: 0, windowExpired: 0, errors: 0, skipped: true };
  }
  return lockResult.result;
}

async function runObligationPass(opts, batchSize, maxBatches) {
  const stats = { scanned: 0, reminders: 0, overdue: 0, windowExpired: 0, errors: 0, skipped: false };
  const now = opts.now instanceof Date ? opts.now : new Date();
  let passFinished = false;

  for (let batch = 0; batch < maxBatches; batch++) {
      let rows;
      try {
        rows = await prisma.customerPaymentObligation.findMany({
          where: {
            status: { in: ["DUE", "OVERDUE"] },
            ...(cursorId ? { id: { gt: cursorId } } : {}),
            ...(opts.customerId ? { customerId: String(opts.customerId) } : {}),
          },
          take: batchSize,
          orderBy: { id: "asc" },
          include: {
            job: { select: { id: true, title: true, customerId: true, providerId: true, status: true, meta: true } },
          },
        });
      } catch (e) {
        console.warn("[customerPaymentObligation] query failed", e?.message || e);
        return stats;
      }

      if (rows.length === 0) {
        cursorId = null;
        passFinished = true;
        break;
      }
      cursorId = rows[rows.length - 1].id;

      for (const row of rows) {
        stats.scanned++;
        try {
          const amount = Number(row.amount);
          if (!(amount > 0.01)) continue;
          if (row.jobId && (await obligationService.isJobUnderOpenCase(row.jobId))) {
            await obligationService.pauseWorkflowObligationForOpenCase(row.jobId, row.customerId);
            continue;
          }
          if (row.restrictionStartsAt) {
            await enforceCompletionWindow(row, now, stats);
          } else {
            await enforceLegacyDue(row, now, stats);
          }
        } catch (e) {
          stats.errors++;
          console.error("[customerPaymentObligation] row failed", row.id, e?.message || e);
        }
      }

      if (rows.length < batchSize) {
        cursorId = null;
        passFinished = true;
        break;
      }
    }
  if (!passFinished && cursorId) {
    stats.cursor = cursorId;
  }

  if (stats.reminders > 0 || stats.overdue > 0 || stats.windowExpired > 0 || stats.errors > 0) {
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
  resetObligationCursorForTests() {
    cursorId = null;
  },
};
