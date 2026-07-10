/** Derive audit event severity from action string (no DB field). */
function deriveSeverity(action) {
  const a = String(action || "").toLowerCase();

  const criticalPatterns = [
    "reconcile.mismatch",
    "auth.login.failed",
    "fraud.",
    "admin.fraud.",
    "payment.refund",
    "admin.job_refund",
    "withdrawal.auto_failed",
    "upload.rate_violation",
    "notification.delivery.failed",
    "verification.customer.blocked",
    "verification.customer.deleted",
    "admin.provider.blocked",
  ];
  if (criticalPatterns.some((p) => a.includes(p) || a.startsWith(p.replace(/\.$/, "")))) {
    return "critical";
  }

  const warningPatterns = [
    "verification.provider.rejected",
    "verification.provider.document_rejected",
    "dispute.opened",
    "dispute.reopened",
    "upload.rate_limited",
    "withdrawal.mark_failed",
    "material_order.delivery_issue",
    "material_order.cancel.",
  ];
  if (warningPatterns.some((p) => a.includes(p) || a.startsWith(p))) {
    return "warning";
  }

  return "info";
}

module.exports = {
  deriveSeverity,
};
