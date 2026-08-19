const REFUND_SETTLED_STATUSES = new Set([
  "processed",
  "partial",
  "recorded",
  "gateway_failed",
  "pending_manual_gateway",
]);

function workflowStatusOf(row) {
  return String(row.workflowStatus || row.status || "").toUpperCase();
}

/** Cancelled, rejected, or refund-settled jobs must not inflate remaining-share totals. */
function isDeadOrRefundedForRemaining(row) {
  const ws = workflowStatusOf(row);
  if (ws === "CANCELLED" || ws === "REJECTED") return true;
  const rs = String(row.refundStatus || "").toLowerCase();
  if (REFUND_SETTLED_STATUSES.has(rs) || rs.includes("cancel")) return true;
  const refundAmt = Number(row.refundAmount) || 0;
  const clawback =
    Number(row.clawbackFromReleased) || Number(row.refundDetails?.clawbackApplied) || 0;
  if ((refundAmt > 0 || clawback > 0) && ws.includes("CANCEL")) return true;
  return false;
}

function netProviderShareRecorded(row) {
  const recorded = Math.max(0, Number(row.providerShareRecorded) || 0);
  const clawback = Math.max(
    0,
    Number(row.clawbackFromReleased) || Number(row.refundDetails?.clawbackApplied) || 0
  );
  const debt = Math.max(
    0,
    Number(row.providerRefundDebt) || Number(row.refundDetails?.providerDebtAdded) || 0
  );
  return Math.max(0, recorded - clawback - debt);
}

function remainingShareForSummary(row) {
  if (isDeadOrRefundedForRemaining(row)) return 0;
  return Math.max(0, Number(row.providerShareRemaining) || 0);
}

function sumProviderShareTotals(rows) {
  let totalProviderShareRecorded = 0;
  let totalProviderShareRemaining = 0;
  for (const row of rows) {
    totalProviderShareRecorded += netProviderShareRecorded(row);
    totalProviderShareRemaining += remainingShareForSummary(row);
  }
  return { totalProviderShareRecorded, totalProviderShareRemaining };
}

module.exports = {
  isDeadOrRefundedForRemaining,
  netProviderShareRecorded,
  remainingShareForSummary,
  sumProviderShareTotals,
};
