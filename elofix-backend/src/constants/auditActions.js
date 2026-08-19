/** Canonical audit action strings — dot-namespaced for filtering. */
const AUDIT_ACTIONS = {
  // Authentication
  AUTH_LOGIN_SUCCESS: "auth.login.success",
  AUTH_LOGIN_FAILED: "auth.login.failed",
  AUTH_LOGOUT: "auth.logout",
  AUTH_PASSWORD_CHANGED: "auth.password.changed",
  AUTH_PASSWORD_RESET_REQUESTED: "auth.password_reset.requested",
  AUTH_PASSWORD_RESET_FAILED: "auth.password_reset.failed",
  AUTH_PASSWORD_RESET_COMPLETED: "auth.password_reset.completed",

  // Provider verification
  VERIFICATION_PROVIDER_APPROVED: "verification.provider.approved",
  VERIFICATION_PROVIDER_REJECTED: "verification.provider.rejected",
  VERIFICATION_PROVIDER_UNREJECTED: "verification.provider.unrejected",
  VERIFICATION_PROVIDER_DOC_APPROVED: "verification.provider.document_approved",
  VERIFICATION_PROVIDER_DOC_REJECTED: "verification.provider.document_rejected",

  // Customer verification
  VERIFICATION_CUSTOMER_BLOCKED: "verification.customer.blocked",
  VERIFICATION_CUSTOMER_UNBLOCKED: "verification.customer.unblocked",
  VERIFICATION_CUSTOMER_DELETED: "verification.customer.deleted",

  // Payments
  PAYMENT_PAY_LABOR: "payment.pay_labor",
  PAYMENT_RELEASE_ESCROW: "payment.release_escrow",
  PAYMENT_ESCROW_SETTLED: "payment.escrow.settled",
  PAYMENT_REFUND: "payment.refund",

  // Refunds
  ADMIN_JOB_REFUND: "admin.job_refund",

  // Disputes
  DISPUTE_OPENED: "dispute.opened",
  DISPUTE_REOPENED: "dispute.reopened",
  DISPUTE_STATUS_UPDATE: "dispute.status_update",
  DISPUTE_RESOLVED: "dispute.resolved",

  // Fraud
  FRAUD_ALERT_CREATED: "fraud.alert.created",
  FRAUD_ALERT_UPDATED: "fraud.alert.updated",
  ADMIN_FRAUD_REVIEWED: "admin.fraud.reviewed",

  // Uploads
  UPLOAD_RECORDED: "upload.recorded",
  UPLOAD_RATE_LIMITED: "upload.rate_limited",
  UPLOAD_RATE_VIOLATION: "upload.rate_violation",

  // Trust score
  TRUST_SCORE_CHANGED: "trust_score.changed",

  // Admin — provider
  ADMIN_PROVIDER_BLOCKED: "admin.provider.blocked",
  ADMIN_PROVIDER_UNBLOCKED: "admin.provider.unblocked",

  // Admin — payments
  ADMIN_PAYMENT_FORCE_SETTLE: "admin.payment.force_settle",

  // Payout profiles
  PAYOUT_PROFILE_CREATED: "payout.profile.created",
  PAYOUT_PROFILE_UPDATED: "payout.profile.updated",
  PAYOUT_PROFILE_REPLACED: "payout.profile.replaced",
  PAYOUT_PROFILE_DEACTIVATED: "payout.profile.deactivated",
  PAYOUT_VERIFICATION_REQUESTED: "payout.verification.requested",
  PAYOUT_VERIFICATION_SUCCEEDED: "payout.verification.succeeded",
  PAYOUT_VERIFICATION_FAILED: "payout.verification.failed",

  // Withdrawals
  WITHDRAWAL_REQUEST: "withdrawal.request",
  WITHDRAWAL_APPROVE: "withdrawal.approve",
  WITHDRAWAL_MARK_PAID: "withdrawal.mark_paid",
  WITHDRAWAL_MARK_FAILED: "withdrawal.mark_failed",
  WITHDRAWAL_AUTO_FAILED_STALE: "withdrawal.auto_failed_stale",

  // Material orders
  MATERIAL_ORDER_DELIVERY_ISSUE: "material_order.delivery_issue",
  MATERIAL_ORDER_CANCEL_SUPPLIER: "material_order.cancel.supplier",
  MATERIAL_ORDER_CANCEL_CUSTOMER: "material_order.cancel.customer",

  // Reconciliation
  RECONCILE_MISMATCH: "reconcile.mismatch",

  // Jobs
  JOB_AUTO_ACCEPTED: "job.auto_accepted",
  REVIEW_UPSERT: "review.upsert",

  PAYMENT_OBLIGATION_CREATED: "payment.obligation.created",
  PAYMENT_OBLIGATION_OVERDUE: "payment.obligation.overdue",
  CUSTOMER_PAYMENT_RESTRICTION_APPLIED: "customer.payment_restriction.applied",
  CUSTOMER_PAYMENT_RESTRICTION_CLEARED: "customer.payment_restriction.cleared",
  PROVIDER_REPAYMENT_OVERDUE: "provider.repayment.overdue",
  PROVIDER_RESTRICTION_APPLIED: "provider.restriction.applied",
  PROVIDER_RESTRICTION_CLEARED: "provider.restriction.cleared",
  LEGAL_REACCEPTED: "legal.reaccepted",

  // Notifications
  NOTIFICATION_CREATED: "notification.created",
  NOTIFICATION_DEDUPED: "notification.deduped",
  NOTIFICATION_SOCKET_SENT: "notification.socket.sent",
  NOTIFICATION_EMAIL_SENT: "notification.email.sent",
  NOTIFICATION_DELIVERY_FAILED: "notification.delivery.failed",
};

/** Map action prefix → category for admin filtering. */
const ACTION_CATEGORIES = {
  authentication: ["auth."],
  verification: ["verification."],
  payments: ["payment."],
  disputes: ["dispute."],
  fraud: ["fraud.", "admin.fraud."],
  uploads: ["upload."],
  trust_score: ["trust_score."],
  admin: ["admin.", "withdrawal.", "reconcile.", "material_order.", "job.", "review.", "customer.", "provider.", "legal."],
  notifications: ["notification."],
};

const ENTITY_TYPES = {
  USER: "user",
  PROVIDER: "provider",
  JOB: "job",
  DISPUTE: "dispute",
  PAYMENT: "payment",
  WITHDRAWAL: "withdrawal",
  BRANCH: "branch",
  SUPPLIER: "supplier",
  FRAUD_ALERT: "fraud_alert",
  TRUST_SCORE: "trust_score",
  NOTIFICATION: "notification",
};

const ACTOR_TYPES = {
  USER: "USER",
  ADMIN: "ADMIN",
  SYSTEM: "SYSTEM",
  BRANCH_STAFF: "BRANCH_STAFF",
};

module.exports = { AUDIT_ACTIONS, ACTION_CATEGORIES, ENTITY_TYPES, ACTOR_TYPES };
