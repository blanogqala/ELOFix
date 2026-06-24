/**
 * Pure job status helpers (no DB). Used by jobMeta.service and cron eligibility checks.
 */

function toFrontendStatus(dbStatus, meta) {
  const safe = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  if (String(dbStatus) === "COMPLETED" || safe.completionConfirmedByUser === true) {
    return "COMPLETED";
  }
  if (safe.statusOverride === "DISPUTED") return "DISPUTED";
  if (safe.statusOverride) return safe.statusOverride;
  if (dbStatus === "ACCEPTED") return "ASSIGNED";
  return dbStatus;
}

module.exports = { toFrontendStatus };
