const prisma = require("../config/prisma");
const { getJobMeta, toFrontendStatus } = require("../services/jobMeta.service");

const ONE_HOUR_MS = 60 * 60 * 1000;

async function processStaleConfirmations() {
  let jobs;
  try {
    jobs = await prisma.job.findMany({
      where: {
        status: { in: ["IN_PROGRESS", "ACCEPTED"] },
        laborPaid: true,
      },
      select: { id: true, status: true, meta: true, customerId: true, providerId: true, title: true },
      take: 200,
    });
  } catch (e) {
    console.warn("[completionDeadline] query failed", e?.message || e);
    return;
  }

  const jobService = require("../services/job.service");
  const now = Date.now();

  for (const job of jobs) {
    try {
      const meta = await getJobMeta(job.id);
      const status = toFrontendStatus(job.status, meta);
      if (status !== "AWAITING_CONFIRMATION") continue;
      const deadline = meta.confirmationDeadlineAt ? new Date(meta.confirmationDeadlineAt).getTime() : 0;
      if (!deadline || deadline > now) continue;
      await jobService.autoCompleteJobAfterDeadline(job.id);
    } catch (e) {
      console.error("[completionDeadline] failed for job", job.id, e?.message || e);
    }
  }
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

module.exports = { startCompletionDeadlineJob, processStaleConfirmations };
