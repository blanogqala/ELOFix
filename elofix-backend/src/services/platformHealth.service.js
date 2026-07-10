const fs = require("fs/promises");
const prisma = require("../config/prisma");
const { UPLOAD_ROOT } = require("../middleware/upload.middleware");

function envFlag(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function cronDisabled(jobEnvVar) {
  if (process.env.NODE_ENV === "development" && envFlag(jobEnvVar)) return true;
  return false;
}

async function checkDatabase() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    return {
      id: "database",
      label: "Database",
      status: latencyMs > 2000 ? "degraded" : "healthy",
      detail: `Connected (${latencyMs}ms)`,
      latencyMs,
    };
  } catch (err) {
    return {
      id: "database",
      label: "Database",
      status: "down",
      detail: err instanceof Error ? err.message : "Connection failed",
      latencyMs: Date.now() - start,
    };
  }
}

async function checkStorage() {
  const start = Date.now();
  try {
    await fs.access(UPLOAD_ROOT);
    const latencyMs = Date.now() - start;
    return {
      id: "storage",
      label: "Storage",
      status: "healthy",
      detail: "Upload root accessible",
      latencyMs,
    };
  } catch (err) {
    return {
      id: "storage",
      label: "Storage",
      status: "down",
      detail: err instanceof Error ? err.message : "Upload root unavailable",
      latencyMs: Date.now() - start,
    };
  }
}

async function checkNotifications() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.notification.count({
    where: { createdAt: { gte: since } },
  });
  return {
    id: "notifications",
    label: "Notifications",
    status: "healthy",
    detail: `${count} created in 24h`,
    latencyMs: 0,
  };
}

async function checkPayments() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [success, failed] = await Promise.all([
    prisma.paymentIntent.count({
      where: { createdAt: { gte: since }, state: { in: ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"] } },
    }),
    prisma.paymentIntent.count({
      where: { createdAt: { gte: since }, state: { in: ["FAILED", "CANCELLED"] } },
    }),
  ]);
  const total = success + failed;
  const failRate = total > 0 ? failed / total : 0;
  let status = "healthy";
  if (failRate > 0.2) status = "down";
  else if (failRate > 0.05 || failed > 10) status = "degraded";
  return {
    id: "payments",
    label: "Payments",
    status,
    detail: `${success} ok / ${failed} failed (24h)`,
    latencyMs: 0,
  };
}

async function checkEmail() {
  const [pending, failed] = await Promise.all([
    prisma.notificationDeliveryOutbox.count({
      where: { channel: "EMAIL", status: "PENDING" },
    }),
    prisma.notificationDeliveryOutbox.count({
      where: { channel: "EMAIL", status: { in: ["FAILED", "DEAD"] } },
    }),
  ]);
  let status = "healthy";
  if (failed > 50) status = "down";
  else if (pending > 100 || failed > 5) status = "degraded";
  return {
    id: "email",
    label: "Email",
    status,
    detail: `${pending} pending, ${failed} failed`,
    latencyMs: 0,
  };
}

async function checkQueues() {
  const [pending, failed] = await Promise.all([
    prisma.notificationDeliveryOutbox.count({ where: { status: "PENDING" } }),
    prisma.notificationDeliveryOutbox.count({ where: { status: { in: ["FAILED", "DEAD"] } } }),
  ]);
  let status = "healthy";
  if (failed > 100) status = "down";
  else if (pending > 200 || failed > 10) status = "degraded";
  return {
    id: "queues",
    label: "Queues",
    status,
    detail: `${pending} pending, ${failed} failed`,
    latencyMs: 0,
  };
}

async function checkBackgroundJobs() {
  const lastSent = await prisma.notificationDeliveryOutbox.findFirst({
    where: { status: "SENT", sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  const crons = [
    { name: "notificationOutbox", disabled: cronDisabled("DISABLE_NOTIFICATION_OUTBOX_CRON") },
    { name: "completionDeadline", disabled: cronDisabled("DISABLE_COMPLETION_DEADLINE_CRON") },
    { name: "stuckWithdrawal", disabled: cronDisabled("DISABLE_STUCK_WITHDRAWAL_CRON") },
  ];
  const disabledCount = crons.filter((c) => c.disabled).length;
  let status = "healthy";
  if (disabledCount === crons.length) status = "degraded";
  const lastRun = lastSent?.sentAt
    ? lastSent.sentAt.toISOString()
    : "No recent outbox delivery";
  return {
    id: "background_jobs",
    label: "Background Jobs",
    status,
    detail: `${disabledCount}/${crons.length} crons disabled · last delivery ${lastRun}`,
    latencyMs: 0,
  };
}

async function getPlatformHealth() {
  const checkedAt = new Date().toISOString();
  const components = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkNotifications(),
    checkPayments(),
    checkEmail(),
    checkQueues(),
    checkBackgroundJobs(),
  ]);
  return { checkedAt, components };
}

module.exports = {
  getPlatformHealth,
};
