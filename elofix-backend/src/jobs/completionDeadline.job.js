const prisma = require("../config/prisma");
const { getJobMeta } = require("../services/jobMeta.service");
const {
  isConfirmationDeadlineReached,
  isEligibleForSystemComplete,
} = require("../utils/completionDeadline.util");
const { withAdvisoryLock } = require("../utils/workerLock.util");

const ONE_HOUR_MS = 60 * 60 * 1000;
const BATCH_SIZE = 200;
const MAX_BATCHES = 20;
const LOCK_KEY = 814201;

let running = false;
let cursorId = null;

async function processStaleConfirmations(opts = {}) {
  if (running) return { scanned: 0, autoAccepted: 0, skipped: 0, errors: 0, skippedOverlap: true };
  const batchSize = opts.batchSize || BATCH_SIZE;
  const maxBatches = opts.maxBatches || MAX_BATCHES;
  running = true;
  let lockResult;
  try {
    lockResult = await withAdvisoryLock(LOCK_KEY, () => runCompletionPass(opts, batchSize, maxBatches));
  } catch (e) {
    console.warn("[completionDeadline] lock failed", e?.message || e);
    return { scanned: 0, autoAccepted: 0, skipped: 0, errors: 0, skippedOverlap: true };
  } finally {
    running = false;
  }
  if (!lockResult?.locked) {
    return { scanned: 0, autoAccepted: 0, skipped: 0, errors: 0, skippedOverlap: true };
  }
  return lockResult.result;
}

async function runCompletionPass(opts, batchSize, maxBatches) {
  const stats = { scanned: 0, autoAccepted: 0, skipped: 0, errors: 0 };
  const jobService = require("../services/job.service");
  const now = opts.nowMs || Date.now();
  let passFinished = false;

  for (let batch = 0; batch < maxBatches; batch++) {
      let jobs;
      try {
        jobs = await prisma.job.findMany({
          where: {
            status: { in: ["IN_PROGRESS", "ACCEPTED"] },
            OR: [{ laborPaid: true }, { legacyEscrowV2: true }],
            ...(cursorId ? { id: { gt: cursorId } } : {}),
          },
          select: {
            id: true,
            status: true,
            meta: true,
            customerId: true,
            providerId: true,
            title: true,
            laborPaid: true,
            legacyEscrowV2: true,
            paymentModeSnapshot: true,
            paymentProgress: true,
            escrowSecondReleaseDone: true,
            paymentReleased: true,
          },
          orderBy: { id: "asc" },
          take: batchSize,
        });
      } catch (e) {
        console.warn("[completionDeadline] query failed", e?.message || e);
        return stats;
      }

      if (jobs.length === 0) {
        cursorId = null;
        passFinished = true;
        break;
      }
      cursorId = jobs[jobs.length - 1].id;

      for (const job of jobs) {
        stats.scanned++;
        try {
          const meta = await getJobMeta(job.id);
          if (!isConfirmationDeadlineReached(job, meta, now)) {
            stats.skipped++;
            continue;
          }
          const openCase = await prisma.jobDispute.findFirst({
            where: { jobId: job.id, status: { in: ["OPEN", "UNDER_INVESTIGATION"] } },
            select: { id: true },
          });
          if (openCase) {
            stats.skipped++;
            continue;
          }
          const balanceDue = jobService.completionBalanceStillDue(job, meta);
          if (!isEligibleForSystemComplete(job, meta, now, { balanceDue, courierFlow: Boolean(meta?.courierFlow) })) {
            stats.skipped++;
            continue;
          }
          const result = await jobService.systemCompleteJobAfterDeadline(job.id);
          if (result) stats.autoAccepted++;
          else stats.skipped++;
        } catch (e) {
          stats.errors++;
          console.error("[completionDeadline] failed for job", job.id, e?.message || e);
        }
      }

      if (jobs.length < batchSize) {
        cursorId = null;
        passFinished = true;
        break;
      }
    }
  if (!passFinished && cursorId) stats.cursor = cursorId;

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
  resetCompletionCursorForTests() {
    cursorId = null;
  },
};
