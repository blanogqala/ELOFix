const prisma = require("../config/prisma");
const outboxService = require("../services/notificationDeliveryOutbox.service");

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 50;

async function processNotificationOutbox() {
  const stats = { processed: 0, sent: 0, retried: 0, dead: 0, errors: 0 };
  try {
    const batch = await outboxService.processOutboxBatch(BATCH_SIZE);
    Object.assign(stats, batch);
  } catch (e) {
    stats.errors++;
    console.warn("[notificationOutbox] batch failed", e?.message || e);
  }
  if (stats.sent > 0 || stats.dead > 0 || stats.errors > 0) {
    console.log("[notificationOutbox] tick summary", stats);
  }
  return stats;
}

function startNotificationOutboxJob() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DISABLE_NOTIFICATION_OUTBOX_CRON === "true"
  ) {
    console.log("[notificationOutbox] cron disabled");
    return () => {};
  }
  const tick = () => {
    processNotificationOutbox().catch((err) => {
      console.error("[notificationOutbox] tick error", err);
    });
  };
  const id = setInterval(tick, POLL_INTERVAL_MS);
  if (typeof id.unref === "function") id.unref();
  tick();
  return () => clearInterval(id);
}

module.exports = {
  startNotificationOutboxJob,
  processNotificationOutbox,
};
