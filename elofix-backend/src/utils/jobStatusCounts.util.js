const jobMeta = require("../services/jobMeta.service");

const ACTIVE_STATUSES = new Set([
  "ASSIGNED",
  "INSPECTED",
  "SERVICE_PRICE_SUBMITTED",
  "SERVICE_PAID",
  "MATERIALS_SUBMITTED",
  "MATERIALS_PAID",
  "IN_PROGRESS",
  "AWAITING_CONFIRMATION",
]);

function isJobWorkflowCompleted(jobRow) {
  const meta = jobMeta.normalizeMeta(jobRow.meta);
  return jobMeta.isTerminalJobState(meta, jobRow);
}

function effectiveFrontendStatus(jobRow) {
  const meta = jobMeta.normalizeMeta(jobRow.meta);
  return jobMeta.toFrontendStatus(jobRow.status, meta);
}

/**
 * Count jobs by frontend status buckets.
 * `open` = PENDING (awaiting assignment / not yet active).
 */
function countJobsByStatus(jobs) {
  const counts = {
    total: jobs.length,
    completed: 0,
    active: 0,
    open: 0,
    rejected: 0,
    cancelled: 0,
    disputed: 0,
  };
  (Array.isArray(jobs) ? jobs : []).forEach((job) => {
    if (isJobWorkflowCompleted(job)) {
      counts.completed += 1;
      return;
    }
    const st = effectiveFrontendStatus(job);
    if (st === "COMPLETED") counts.completed += 1;
    else if (st === "REJECTED") counts.rejected += 1;
    else if (st === "CANCELLED") counts.cancelled += 1;
    else if (st === "DISPUTED") {
      counts.disputed += 1;
      counts.active += 1;
    } else if (ACTIVE_STATUSES.has(st)) counts.active += 1;
    else if (st === "PENDING") counts.open += 1;
  });
  return counts;
}

module.exports = {
  ACTIVE_STATUSES,
  effectiveFrontendStatus,
  isJobWorkflowCompleted,
  countJobsByStatus,
};
