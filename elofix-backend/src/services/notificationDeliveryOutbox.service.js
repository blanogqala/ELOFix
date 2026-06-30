const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");
const emailService = require("./email.service");

/** Backoff schedule: 30s, 2m, 10m, 30m, 2h */
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];

function nextBackoffDate(attempts) {
  const idx = Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1);
  return new Date(Date.now() + BACKOFF_MS[idx]);
}

function trySocketEmit(payload) {
  const userId = payload?.userId;
  const event = payload?.event;
  const data = payload?.data;
  if (!userId || !event) {
    throw new Error("Invalid socket outbox payload");
  }
  if (!global.io) {
    throw new Error("Socket.IO not initialized");
  }
  global.io.to(String(userId)).emit(event, data);
}

async function enqueueSocketDelivery({ notificationId, userId, event, payload }) {
  return prisma.notificationDeliveryOutbox.create({
    data: {
      id: randomUUID(),
      notificationId: notificationId || null,
      channel: "SOCKET",
      payload: {
        userId: String(userId),
        event: String(event),
        data: payload,
      },
      status: "PENDING",
      maxAttempts: 5,
      nextAttemptAt: new Date(),
    },
  });
}

async function enqueueEmailDelivery({ to, subject, body, notificationId }) {
  const recipient = String(to || "").trim();
  if (!recipient) return null;
  return prisma.notificationDeliveryOutbox.create({
    data: {
      id: randomUUID(),
      notificationId: notificationId || null,
      channel: "EMAIL",
      payload: {
        to: recipient,
        subject: String(subject || "EloFix notification"),
        body: String(body || ""),
      },
      status: "PENDING",
      maxAttempts: 5,
      nextAttemptAt: new Date(),
    },
  });
}

async function deliverOutboxRow(row) {
  if (row.channel === "SOCKET") {
    trySocketEmit(row.payload);
    return { ok: true };
  }
  if (row.channel === "EMAIL") {
    const { to, subject, body } = row.payload || {};
    const result = await emailService.sendTransactionalEmail({ to, subject, body });
    if (result?.error) {
      return { ok: false, error: result.errorMessage || "Email send failed" };
    }
    if (result?.skipped) {
      return { ok: false, error: "Email provider not configured" };
    }
    return { ok: true };
  }
  return { ok: false, error: `Unknown channel: ${row.channel}` };
}

async function processOutboxBatch(limit = 50) {
  const stats = { processed: 0, sent: 0, retried: 0, dead: 0, errors: 0 };
  const now = new Date();

  const rows = await prisma.notificationDeliveryOutbox.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  for (const row of rows) {
    stats.processed++;
    try {
      const result = await deliverOutboxRow(row);
      if (result.ok) {
        await prisma.notificationDeliveryOutbox.update({
          where: { id: row.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            attempts: row.attempts + 1,
            lastError: null,
          },
        });
        stats.sent++;
        const auditAction =
          row.channel === "EMAIL"
            ? AUDIT_ACTIONS.NOTIFICATION_EMAIL_SENT
            : AUDIT_ACTIONS.NOTIFICATION_SOCKET_SENT;
        void logAudit(auditAction, {
          entityType: ENTITY_TYPES.NOTIFICATION,
          entityId: row.notificationId || row.id,
          newValue: {
            outboxId: row.id,
            channel: row.channel,
            attempts: row.attempts + 1,
          },
        });
        continue;
      }

      const nextAttempts = row.attempts + 1;
      const errMsg = String(result.error || "Delivery failed");
      if (nextAttempts >= row.maxAttempts) {
        await prisma.notificationDeliveryOutbox.update({
          where: { id: row.id },
          data: {
            status: "DEAD",
            attempts: nextAttempts,
            lastError: errMsg,
          },
        });
        stats.dead++;
        void logAudit(AUDIT_ACTIONS.NOTIFICATION_DELIVERY_FAILED, {
          entityType: ENTITY_TYPES.NOTIFICATION,
          entityId: row.notificationId || row.id,
          newValue: {
            outboxId: row.id,
            channel: row.channel,
            attempts: nextAttempts,
            lastError: errMsg,
            final: true,
          },
        });
      } else {
        await prisma.notificationDeliveryOutbox.update({
          where: { id: row.id },
          data: {
            status: "PENDING",
            attempts: nextAttempts,
            lastError: errMsg,
            nextAttemptAt: nextBackoffDate(nextAttempts),
          },
        });
        stats.retried++;
      }
    } catch (err) {
      stats.errors++;
      const nextAttempts = row.attempts + 1;
      const errMsg = String(err?.message || err);
      if (nextAttempts >= row.maxAttempts) {
        await prisma.notificationDeliveryOutbox.update({
          where: { id: row.id },
          data: {
            status: "DEAD",
            attempts: nextAttempts,
            lastError: errMsg,
          },
        });
        stats.dead++;
        void logAudit(AUDIT_ACTIONS.NOTIFICATION_DELIVERY_FAILED, {
          entityType: ENTITY_TYPES.NOTIFICATION,
          entityId: row.notificationId || row.id,
          newValue: {
            outboxId: row.id,
            channel: row.channel,
            attempts: nextAttempts,
            lastError: errMsg,
            final: true,
          },
        });
      } else {
        await prisma.notificationDeliveryOutbox.update({
          where: { id: row.id },
          data: {
            status: "PENDING",
            attempts: nextAttempts,
            lastError: errMsg,
            nextAttemptAt: nextBackoffDate(nextAttempts),
          },
        });
        stats.retried++;
      }
    }
  }

  return stats;
}

module.exports = {
  enqueueSocketDelivery,
  enqueueEmailDelivery,
  processOutboxBatch,
  trySocketEmit,
  BACKOFF_MS,
};
