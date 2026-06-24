const { toFrontendStatus } = require("../utils/jobStatus.util");

/**
 * Pure eligibility check for auto-accept after confirmation deadline.
 * @param {{ status: string }} job
 * @param {object} meta
 * @param {number} [nowMs]
 */
function isEligibleForAutoAccept(job, meta, nowMs = Date.now()) {
  const status = toFrontendStatus(job.status, meta);
  if (status !== "AWAITING_CONFIRMATION") return false;
  const deadline = meta.confirmationDeadlineAt ? new Date(meta.confirmationDeadlineAt).getTime() : 0;
  if (!deadline || deadline > nowMs) return false;
  return true;
}

module.exports = { isEligibleForAutoAccept };
