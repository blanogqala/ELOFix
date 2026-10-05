const { toFrontendStatus } = require("../utils/jobStatus.util");

const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIRMATION_WINDOW_DAYS = 7;
const RECOVERY_WINDOW_DAYS = 30;

/**
 * Seven calendar days from the persisted mark-complete instant.
 * Production does not read minute overrides.
 * @param {Date|string|number} markedCompleteAt
 */
function confirmationDeadlineFrom(markedCompleteAt) {
  const start = markedCompleteAt instanceof Date ? markedCompleteAt : new Date(markedCompleteAt);
  return new Date(start.getTime() + CONFIRMATION_WINDOW_DAYS * DAY_MS);
}

/**
 * Recovery / overdue deadline: 30 calendar days after the confirmation deadline (day 37).
 * Independent of the shared refund-debt due config.
 * @param {Date|string|number} confirmationDeadlineAt
 */
function recoveryDueAtFrom(confirmationDeadlineAt) {
  const start = confirmationDeadlineAt instanceof Date ? confirmationDeadlineAt : new Date(confirmationDeadlineAt);
  return new Date(start.getTime() + RECOVERY_WINDOW_DAYS * DAY_MS);
}

/**
 * Status + persisted confirmation deadline only.
 * @param {{ status: string }} job
 * @param {object} meta
 * @param {number} [nowMs]
 */
function isConfirmationDeadlineReached(job, meta, nowMs = Date.now()) {
  const status = toFrontendStatus(job.status, meta);
  if (status !== "AWAITING_CONFIRMATION") return false;
  const deadline = meta?.confirmationDeadlineAt ? new Date(meta.confirmationDeadlineAt).getTime() : 0;
  if (!deadline || deadline > nowMs) return false;
  return true;
}

/**
 * @deprecated Prefer isConfirmationDeadlineReached. Kept for existing deadline checks.
 */
function isEligibleForAutoAccept(job, meta, nowMs = Date.now()) {
  return isConfirmationDeadlineReached(job, meta, nowMs);
}

/**
 * System completion after the confirmation window.
 * Unpaid non-legacy balances are not eligible (no throw, no customer confirmation).
 * Fully paid upfront stays eligible when funds were already released.
 * Legacy escrow and courier holds stay eligible so the existing release path can run.
 * @param {{ status: string, legacyEscrowV2?: boolean }} job
 * @param {object} meta
 * @param {number} [nowMs]
 * @param {{ balanceDue?: boolean, courierFlow?: boolean }} [opts]
 */
function isEligibleForSystemComplete(job, meta, nowMs = Date.now(), opts = {}) {
  if (!isConfirmationDeadlineReached(job, meta, nowMs)) return false;
  const courier = Boolean(opts.courierFlow || meta?.courierFlow);
  const legacy = Boolean(job?.legacyEscrowV2);
  if (opts.balanceDue && !legacy && !courier) return false;
  return true;
}

module.exports = {
  DAY_MS,
  CONFIRMATION_WINDOW_DAYS,
  RECOVERY_WINDOW_DAYS,
  confirmationDeadlineFrom,
  recoveryDueAtFrom,
  isConfirmationDeadlineReached,
  isEligibleForAutoAccept,
  isEligibleForSystemComplete,
};
