const prisma = require("../config/prisma");
const { getJobMeta } = require("../services/jobMeta.service");
const { isEligibleForAutoAccept } = require("../utils/completionDeadline.util");

const ONE_HOUR_MS = 60 * 60 * 1000;
const BATCH_SIZE = 200;
const MAX_BATCHES = 5;

async function processStaleConfirmations() {
  const stats = { scanned: 0, autoAccepted: 0, skipped: 0, errors: 0 };
  const jobService = require("../services/job.service");
  const now = Date.now();
  let cursor = undefined;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    let jobs;
    try {
      jobs = await prisma.job.findMany({
        where: {
          status: { in: ["IN_PROGRESS", "ACCEPTED"] },
          laborPaid: true,
        },
        select: { id: true, status: true, meta: true, customerId: true, providerId: true, title: true },
        orderBy: { createdAt: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
    } catch (e) {
      console.warn("[completionDeadline] query failed", e?.message || e);
      return stats;
    }

    if (jobs.length === 0) break;
    cursor = jobs[jobs.length - 1].id;

    for (const job of jobs) {
      stats.scanned++;
      try {
        const meta = await getJobMeta(job.id);
        if (!isEligibleForAutoAccept(job, meta, now)) {
          stats.skipped++;
          continue;
        }
        const result = await jobService.autoCompleteJobAfterDeadline(job.id);
        if (result) stats.autoAccepted++;
        else stats.skipped++;
      } catch (e) {
        stats.errors++;
        console.error("[completionDeadline] failed for job", job.id, e?.message || e);
      }
    }

    if (jobs.length < BATCH_SIZE) break;
  }

  if (stats.autoAccepted > 0 || stats.errors > 0) {
    console.log("[completionDeadline] tick summary", stats);
  }
  return stats;
}

function startCompletionDeadlineJob() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DISABLE_COMPLETION_DEADLINE_CRON === "true"
  ) {
    console.log("[completionDeadline] cron disabled");
    return () => {};
  }
  const tick = () => {
    processStaleConfirmations().catch((err) => {
      console.error("[completionDeadline] tick error", err);
    });
  };
  const id = setInterval(tick, ONE_HOUR_MS);
  if (typeof id.unref === "function") id.unref();
  tick();
  return () => clearInterval(id);
}

module.exports = {
  startCompletionDeadlineJob,
  processStaleConfirmations,
};
