const notificationService = require("./notification.service");
const outboxService = require("./notificationDeliveryOutbox.service");
const prisma = require("../config/prisma");

const NOTIFICATION_PREFERENCE_MAP = {
  job_request: "jobRequests",
  courier_delivery_request: "jobRequests",
  payment_made: "payments",
  payment_released: "payments",
};

async function shouldSendProviderNotification(userId, type) {
  const prefKey = NOTIFICATION_PREFERENCE_MAP[String(type || "")];
  if (!prefKey) return true;

  const profile = await prisma.provider.findUnique({
    where: { userId: String(userId) },
    select: { settings: true },
  });
  if (!profile) return true;

  const settings = profile.settings;
  if (!settings || typeof settings !== "object") return true;

  const notifications = settings.notifications;
  if (!notifications || typeof notifications !== "object") return true;

  return notifications[prefKey] !== false;
}

function jobDedupe(jobId, type) {
  const jid = jobId != null && String(jobId).trim() !== "" ? String(jobId).trim() : null;
  return jid ? `job:${jid}:${type}` : null;
}

function userDedupe(userId, type) {
  const uid = userId != null && String(userId).trim() !== "" ? String(userId).trim() : null;
  return uid ? `user:${uid}:${type}` : null;
}

function disputeUserDedupe(disputeId, userId) {
  const did = disputeId != null && String(disputeId).trim() !== "" ? String(disputeId).trim() : null;
  const uid = userId != null && String(userId).trim() !== "" ? String(userId).trim() : null;
  return did && uid ? `dispute:${did}:user:${uid}` : null;
}

function materialOrderDedupe(orderId, suffix) {
  const oid = orderId != null && String(orderId).trim() !== "" ? String(orderId).trim() : null;
  return oid ? `material_order:${oid}:${suffix}` : null;
}

/**
 * Fire-and-forget safe: never throws to callers of job/provider flows.
 */
async function notifyUser(userId, { type, title, message, jobId, materialOrderId, dedupeKey }) {
  if (!userId) return;
  try {
    const allowed = await shouldSendProviderNotification(userId, type);
    if (!allowed) return;

    await notificationService.addNotification({
      userId: String(userId),
      type: String(type || "job_completed"),
      title: String(title || "Notification"),
      message: String(message || ""),
      jobId: jobId || undefined,
      materialOrderId: materialOrderId || undefined,
      dedupeKey: dedupeKey || undefined,
    });
  } catch (err) {
    console.error("[notifications] notifyUser failed", err);
  }
}

async function notifyJobRequest(providerUserId, jobId, jobTitle) {
  return notifyUser(providerUserId, {
    type: "job_request",
    title: "New job request",
    message: `You have a new job request: ${jobTitle || "Job"}`,
    jobId,
    dedupeKey: jobDedupe(jobId, "job_request"),
  });
}

async function notifyJobAccepted(customerId, jobId, jobTitle) {
  return notifyUser(customerId, {
    type: "job_accepted",
    title: "Job accepted",
    message: `A provider accepted your job: ${jobTitle || "Job"}`,
    jobId,
    dedupeKey: jobDedupe(jobId, "job_accepted"),
  });
}

async function notifyInspectionCompleted(customerId, jobId, jobTitle) {
  return notifyUser(customerId, {
    type: "inspection_completed",
    title: "Inspection completed",
    message: `Inspection is done for "${jobTitle || "your job"}". Check the next steps.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "inspection_completed"),
  });
}

async function notifyPriceSubmitted(customerId, jobId, jobTitle) {
  return notifyUser(customerId, {
    type: "price_submitted",
    title: "Price submitted",
    message: `Your provider submitted a service price for "${jobTitle || "your job"}".`,
    jobId,
    dedupeKey: jobDedupe(jobId, "price_submitted"),
  });
}

async function notifyProposedPriceAccepted(providerId, jobId, jobTitle) {
  return notifyUser(providerId, {
    type: "price_submitted",
    title: "Proposed price accepted",
    message: `The customer accepted your proposed labor price for "${jobTitle || "the job"}".`,
    jobId,
    dedupeKey: jobDedupe(jobId, "proposed_price_accepted"),
  });
}

async function notifyPaymentMade(recipientId, jobId, jobTitle, detail) {
  return notifyUser(recipientId, {
    type: "payment_made",
    title: "Payment received",
    message: detail || `A payment was recorded for "${jobTitle || "a job"}".`,
    jobId,
    dedupeKey: jobDedupe(jobId, `payment_made:${recipientId}`),
  });
}

async function notifyDeliveryUpdate(customerId, jobId, jobTitle, statusLabel) {
  const label = String(statusLabel || "updated").toLowerCase().replace(/\s+/g, "_");
  return notifyUser(customerId, {
    type: "delivery_update",
    title: "Delivery update",
    message: `Delivery status for "${jobTitle || "your job"}": ${statusLabel || "updated"}.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `delivery_update:${label}`),
  });
}

async function notifyDeliveryQuoteSubmitted(customerId, orderId, fee, jobId) {
  return notifyUser(customerId, {
    type: "delivery_quote",
    title: "Delivery quote received",
    message: `Your courier quoted R ${Number(fee || 0).toFixed(2)} for delivery. Review and pay when ready.`,
    jobId: jobId || undefined,
    materialOrderId: String(orderId),
    dedupeKey: materialOrderDedupe(orderId, "delivery_quote"),
  });
}

async function notifyCourierDeliveryRequest(courierUserId, orderId) {
  return notifyUser(courierUserId, {
    type: "courier_delivery_request",
    title: "New delivery request",
    message: "A customer requested you for a delivery. Open your deliveries inbox to quote.",
    materialOrderId: String(orderId),
    dedupeKey: materialOrderDedupe(orderId, `courier_request:${courierUserId}`),
  });
}

async function notifyProviderApproved(providerUserId) {
  return notifyUser(providerUserId, {
    type: "provider_approved",
    title: "Profile approved",
    message: "Your provider profile has been approved. You can accept jobs.",
    dedupeKey: userDedupe(providerUserId, "provider_approved"),
  });
}

async function notifyAdminFraudAlert(alert) {
  try {
    const admins = await require("../config/prisma").user.findMany({
      where: { role: "ADMIN", deletedAt: null },
      select: { id: true },
    });
    const title = "Fraud alert";
    const message = `${alert?.alertType || "ALERT"}: ${alert?.description || "Review required"}`;
    const alertId = alert?.id ? String(alert.id) : "unknown";
    for (const admin of admins) {
      await notifyUser(admin.id, {
        type: "fraud_alert",
        title,
        message,
        dedupeKey: `fraud_alert:${alertId}:admin:${admin.id}`,
      });
    }
  } catch (err) {
    console.error("[notifications] notifyAdminFraudAlert failed", err);
  }
}

async function notifyProviderFraudReview(providerUserId) {
  return notifyUser(providerUserId, {
    type: "fraud_review",
    title: "Account under fraud review",
    message:
      "Your company registration is under review due to a potential duplicate. An admin will contact you if needed.",
    dedupeKey: userDedupe(providerUserId, "fraud_review"),
  });
}

async function notifyCategorySuggestion(adminId, suggestionName, suggestionId) {
  return notifyUser(adminId, {
    type: "category_suggestion",
    title: "New category suggestion",
    message: `A user suggested a new category: "${suggestionName}" (id: ${suggestionId}).`,
    dedupeKey: `category_suggestion:${suggestionId}:admin:${adminId}`,
  });
}

async function notifyMaterialsListSubmitted(customerId, jobId, jobTitle, providerName) {
  return notifyUser(customerId, {
    type: "material_list_submitted",
    title: "Materials list ready",
    message: providerName
      ? `${providerName} submitted a materials list for "${jobTitle || "your job"}". Review and pay when ready.`
      : `Your provider submitted a materials list for "${jobTitle || "your job"}". Review and pay when ready.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "material_list_submitted"),
  });
}

async function notifyChatMessage({ recipientId, jobId, jobTitle, message, senderId, senderName, senderRole }) {
  if (!recipientId) return;
  try {
    await notificationService.addNotification({
      userId: String(recipientId),
      type: "job_chat",
      title: senderName ? `Message from ${senderName}` : "New message",
      message: String(message || "").slice(0, 500),
      jobId,
      senderId: senderId ? String(senderId) : undefined,
      senderName: senderName != null ? String(senderName) : undefined,
      senderRole: senderRole != null ? String(senderRole) : undefined,
    });
  } catch (err) {
    console.error("[notifications] notifyChatMessage failed", err);
  }
}

async function queueEmail({ to, subject, body }) {
  if (!to) return;
  try {
    await outboxService.enqueueEmailDelivery({ to, subject, body });
    void outboxService.processOutboxBatch(1);
  } catch (err) {
    console.error("[notifications] queueEmail failed", err);
  }
}

/** @deprecated Use queueEmail — kept for backward compatibility */
async function queueEmailStub(params) {
  return queueEmail(params);
}

async function notifyCustomerConfirmationNeeded(customerId, jobId, jobTitle) {
  await notifyUser(customerId, {
    type: "confirmation_needed",
    title: "Confirm job completion",
    message: `${jobTitle || "Your job"} is awaiting your confirmation. You have 7 days to review the completed work.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "confirmation_needed"),
  });
}

async function notifyJobMarkedComplete(providerId, jobId, jobTitle) {
  await notifyUser(providerId, {
    type: "job_marked_complete",
    title: "Job marked complete",
    message: `You marked "${jobTitle || "the job"}" as complete. Waiting for customer confirmation.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "job_marked_complete"),
  });
}

async function notifyJobCompleted(providerId, jobId, jobTitle) {
  await notifyUser(providerId, {
    type: "job_completed",
    title: "Job completed",
    message: `"${jobTitle || "The job"}" has been marked complete.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "job_completed"),
  });
}

async function notifyPaymentReleased(providerId, jobId, jobTitle) {
  await notifyUser(providerId, {
    type: "payment_released",
    title: "Payment released",
    message: `Remaining payment for "${jobTitle || "your job"}" has been released to your account.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "payment_released"),
  });
}

async function notifyDisputeOpened({ customerId, providerId, jobId, disputeId, jobTitle }) {
  await notifyUser(providerId, {
    type: "dispute_opened",
    title: "Dispute opened",
    message: `A customer opened a dispute for "${jobTitle || "a job"}".`,
    jobId,
    dedupeKey: disputeUserDedupe(disputeId, providerId),
  });
  const admins = await require("../config/prisma").user.findMany({
    where: { role: "ADMIN", deletedAt: null },
    select: { id: true },
    take: 20,
  });
  for (const admin of admins) {
    await notifyUser(admin.id, {
      type: "dispute_opened",
      title: "New dispute",
      message: `Dispute ${disputeId?.slice(-8) || ""} opened for job "${jobTitle || jobId}".`,
      jobId,
      dedupeKey: disputeUserDedupe(disputeId, admin.id),
    });
  }
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL;
  if (supportEmail) {
    await queueEmail({
      to: supportEmail,
      subject: `EloFix dispute opened — job ${jobId}`,
      body: `Customer ${customerId} opened dispute ${disputeId} on job ${jobId}.`,
    });
  }
}

async function notifyDisputeUnderInvestigation({ customerId, providerId, jobId, disputeId }) {
  await notifyUser(customerId, {
    type: "dispute_under_investigation",
    title: "Dispute under review",
    message: "EloFix is investigating your dispute. We will update you soon.",
    jobId,
    dedupeKey: disputeUserDedupe(disputeId, customerId) || jobDedupe(jobId, "dispute_under_investigation:customer"),
  });
  await notifyUser(providerId, {
    type: "dispute_under_investigation",
    title: "Dispute under review",
    message: "EloFix is investigating a dispute on your job.",
    jobId,
    dedupeKey: disputeUserDedupe(disputeId, providerId) || jobDedupe(jobId, "dispute_under_investigation:provider"),
  });
}

async function notifyRefundApproved({ customerId, jobId, amount }) {
  await notifyUser(customerId, {
    type: "refund_approved",
    title: "Refund approved",
    message: `Your refund of R ${Number(amount || 0).toFixed(2)} has been approved.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "refund_approved"),
  });
}

async function notifyCustomerRefundProcessed(customerId, jobId, amount) {
  await notifyUser(customerId, {
    type: "refund_processed",
    title: "Refund processed",
    message: `Your refund of R ${Number(amount || 0).toFixed(2)} has been processed.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "refund_processed"),
  });
}

async function notifyProviderRefundClawback(providerId, jobId, clawbackApplied, providerDebtAdded) {
  const claw = Number(clawbackApplied || 0);
  const debt = Number(providerDebtAdded || 0);
  const parts = [];
  if (claw > 0) parts.push(`R ${claw.toFixed(2)} clawed back from earnings`);
  if (debt > 0) parts.push(`R ${debt.toFixed(2)} added to account debt`);
  const detail = parts.length ? parts.join("; ") : "A refund adjustment was applied to your account.";
  await notifyUser(providerId, {
    type: "refund_clawback",
    title: "Refund adjustment",
    message: `${detail} for job-related refund activity.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `refund_clawback:${claw}:${debt}`),
  });
}

/**
 * Notify provider of dispute/admin refund outcome (full no-payout, partial, or clawback/debt).
 */
async function notifyProviderRefundOutcome({
  providerId,
  jobId,
  action,
  customerRefundNet,
  escrowApplied = 0,
  clawbackApplied = 0,
  providerDebtAdded = 0,
}) {
  if (!providerId) return;

  const refund = Number(customerRefundNet) || 0;
  const escrow = Number(escrowApplied) || 0;
  const claw = Number(clawbackApplied) || 0;
  const debt = Number(providerDebtAdded) || 0;
  const actionKey = String(action || "").toUpperCase();

  if (claw > 0 || debt > 0) {
    await notifyProviderRefundClawback(providerId, jobId, claw, debt);
    return;
  }

  if (actionKey === "FULL_REFUND" && refund > 0) {
    await notifyUser(providerId, {
      type: "refund_no_payout",
      title: "Job refunded — no payment",
      message: `A full refund of R ${refund.toFixed(2)} was issued to the customer. You will not receive payment for this job.`,
      jobId,
      dedupeKey: jobDedupe(jobId, `refund_no_payout:${refund}`),
    });
    return;
  }

  if (actionKey === "PARTIAL_REFUND" && refund > 0) {
    const parts = [`Customer received R ${refund.toFixed(2)} refund`];
    if (escrow > 0) parts.push(`R ${escrow.toFixed(2)} returned from held funds`);
    await notifyUser(providerId, {
      type: "refund_partial",
      title: "Partial refund issued",
      message: `${parts.join(". ")} for this job.`,
      jobId,
      dedupeKey: jobDedupe(jobId, `refund_partial:${refund}`),
    });
  }
}

async function notifyCaseClosed({ customerId, providerId, jobId, disputeId, action }) {
  const msg = `Dispute case closed (${String(action || "resolved").replace(/_/g, " ").toLowerCase()}).`;
  const actionKey = String(action || "resolved").toLowerCase();
  await notifyUser(customerId, {
    type: "case_closed",
    title: "Case closed",
    message: msg,
    jobId,
    dedupeKey: disputeUserDedupe(disputeId, customerId) || jobDedupe(jobId, `case_closed:${actionKey}:customer`),
  });
  await notifyUser(providerId, {
    type: "case_closed",
    title: "Case closed",
    message: msg,
    jobId,
    dedupeKey: disputeUserDedupe(disputeId, providerId) || jobDedupe(jobId, `case_closed:${actionKey}:provider`),
  });
}

async function notifyStagedRefundApproved({
  customerId,
  jobId,
  netTotal,
  immediateAmount,
  pendingAmount,
}) {
  const net = Number(netTotal) || 0;
  const immediate = Number(immediateAmount) || 0;
  const pending = Number(pendingAmount) || 0;
  let message;
  if (pending > 0) {
    message =
      `Your refund of R ${net.toFixed(2)} (net of platform fee) was approved. ` +
      `R ${immediate.toFixed(2)} was refunded to your card now. ` +
      `The remaining R ${pending.toFixed(2)} will be paid as we recover it from the provider (within about 30 days).`;
  } else {
    message = `Your refund of R ${net.toFixed(2)} (net of platform fee) was approved and refunded to your card.`;
  }
  await notifyUser(customerId, {
    type: "refund_approved",
    title: "Refund approved",
    message,
    jobId,
    dedupeKey: jobDedupe(jobId, `refund_approved:${net}:${immediate}`),
  });
}

async function notifyProviderStagedRefundOutcome({
  providerId,
  jobId,
  action,
  customerRefundNet,
  escrowApplied = 0,
  clawbackApplied = 0,
  providerDebtAdded = 0,
  dueAt,
  bankReference,
}) {
  if (!providerId) return;
  const net = Number(customerRefundNet) || 0;
  const debt = Number(providerDebtAdded) || 0;
  const escrow = Number(escrowApplied) || 0;
  const claw = Number(clawbackApplied) || 0;
  const due = dueAt ? new Date(dueAt).toLocaleDateString("en-ZA") : "30 days";
  const ref = bankReference ? ` Use reference: ${bankReference}.` : "";

  const parts = [];
  if (escrow > 0) parts.push(`R ${escrow.toFixed(2)} returned from held funds`);
  if (claw > 0) parts.push(`R ${claw.toFixed(2)} clawed back from your balance`);
  if (debt > 0) {
    parts.push(
      `R ${debt.toFixed(2)} owed — pay by ${due} via bank transfer or future job earnings.${ref} ` +
        `If unpaid, your account will be blocked and legal action may follow.`
    );
  }

  const detail = parts.length ? parts.join(". ") : "No payment for this job.";
  const actionKey = String(action || "").toUpperCase();
  const title =
    debt > 0 ? "Refund debt — action required" : actionKey === "FULL_REFUND" ? "Job refunded" : "Partial refund";

  await notifyUser(providerId, {
    type: debt > 0 ? "refund_debt_due" : "refund_no_payout",
    title,
    message: `Customer refund of R ${net.toFixed(2)} (net). ${detail}`,
    jobId,
    dedupeKey: jobDedupe(jobId, `provider_staged_refund:${debt}`),
  });
}

async function notifyCustomerStagedRefundPayout({ customerId, jobId, amount }) {
  const amt = Number(amount) || 0;
  if (amt <= 0) return;
  await notifyUser(customerId, {
    type: "refund_staged_payout",
    title: "Refund payment received",
    message: `An additional R ${amt.toFixed(2)} from your refund has been paid to your card.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `staged_payout:${amt}`),
  });
}

async function notifyCustomerRepaymentFunded({ customerId, jobId, amount }) {
  await notifyCustomerStagedRefundPayout({ customerId, jobId, amount });
}

async function notifyProviderRepaymentSubmitted(providerId, amount) {
  await notifyUser(providerId, {
    type: "repayment_submitted",
    title: "Repayment submitted",
    message: `Your repayment of R ${Number(amount || 0).toFixed(2)} was submitted for admin review.`,
    dedupeKey: `repayment_submitted:${providerId}:${amount}`,
  });
}

async function notifyProviderRepaymentConfirmed(providerId, amount) {
  await notifyUser(providerId, {
    type: "repayment_confirmed",
    title: "Repayment confirmed",
    message: `Your repayment of R ${Number(amount || 0).toFixed(2)} was confirmed. Thank you.`,
    dedupeKey: `repayment_confirmed:${providerId}:${amount}`,
  });
}

async function notifyProviderRepaymentRejected(providerId, amount, adminNote) {
  const note = adminNote ? ` Note: ${adminNote}` : "";
  await notifyUser(providerId, {
    type: "repayment_rejected",
    title: "Repayment not accepted",
    message: `Your repayment of R ${Number(amount || 0).toFixed(2)} was not accepted.${note}`,
    dedupeKey: `repayment_rejected:${providerId}:${amount}`,
  });
}

async function notifyProviderRefundDebtReminder(providerId, { daysLeft, amountOwed, dueAt, reference }) {
  await notifyUser(providerId, {
    type: "refund_debt_reminder",
    title: "Refund debt reminder",
    message:
      `You owe R ${Number(amountOwed || 0).toFixed(2)} in refund debt. ` +
      `${daysLeft} day(s) remain until ${new Date(dueAt).toLocaleDateString("en-ZA")}. ` +
      `Pay via bank transfer (ref: ${reference}) or from future earnings to avoid account block.`,
    dedupeKey: `refund_debt_reminder:${providerId}:${daysLeft}`,
  });
}

async function notifyAccountBlocked(userId, reason) {
  const message = String(reason || "").trim().slice(0, 500);
  await notifyUser(userId, {
    type: "account_blocked",
    title: "Profile blocked",
    message: message || "Your profile has been blocked. View your profile for details.",
    dedupeKey: userDedupe(userId, "account_blocked"),
  });
}

async function notifyAccountUnblocked(userId) {
  await notifyUser(userId, {
    type: "account_unblocked",
    title: "Profile unblocked",
    message: "Your profile has been unblocked. You can resume working on EloFix.",
    dedupeKey: userDedupe(userId, "account_unblocked"),
  });
}

async function notifyProviderRefundDebtOverdue(providerUserId, amountOwed) {
  await notifyUser(providerUserId, {
    type: "refund_debt_overdue",
    title: "Account blocked — refund debt overdue",
    message:
      `Your account is blocked. R ${Number(amountOwed || 0).toFixed(2)} refund debt was not paid within 30 days. ` +
      `Settle via Earnings or contact support. Legal action may follow.`,
    dedupeKey: `refund_debt_overdue:${providerUserId}`,
  });
}

async function notifyCustomerRefundDebtOverdue(customerId, jobId, pendingAmount) {
  await notifyUser(customerId, {
    type: "refund_recovery_delayed",
    title: "Refund recovery update",
    message:
      `R ${Number(pendingAmount || 0).toFixed(2)} of your refund is still being recovered from the provider. ` +
      `Their account has been blocked for non-payment. We will pay you as funds are recovered.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "refund_recovery_delayed"),
  });
}

async function notifyAdminRefundRepaymentSubmitted({ providerId, repaymentId, amount, reference }) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const admin of admins) {
    await notifyUser(admin.id, {
      type: "admin_repayment_submitted",
      title: "Provider repayment to review",
      message: `Provider submitted R ${Number(amount || 0).toFixed(2)} repayment (ref: ${reference}). Review in admin.`,
      dedupeKey: `admin_repayment:${repaymentId}`,
    });
  }
}

async function notifyAdminRefundDebtOverdue(providerUserId, amountOwed) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const admin of admins) {
    await notifyUser(admin.id, {
      type: "admin_refund_debt_overdue",
      title: "Provider blocked — overdue refund debt",
      message: `Provider ${providerUserId} blocked with R ${Number(amountOwed || 0).toFixed(2)} overdue refund debt. Legal action flagged.`,
      dedupeKey: `admin_overdue:${providerUserId}`,
    });
  }
}

module.exports = {
  notifyUser,
  notifyJobRequest,
  notifyJobAccepted,
  notifyInspectionCompleted,
  notifyPriceSubmitted,
  notifyProposedPriceAccepted,
  notifyPaymentMade,
  notifyDeliveryUpdate,
  notifyDeliveryQuoteSubmitted,
  notifyCourierDeliveryRequest,
  notifyProviderApproved,
  notifyAdminFraudAlert,
  notifyProviderFraudReview,
  notifyCategorySuggestion,
  notifyMaterialsListSubmitted,
  notifyChatMessage,
  notifyCustomerConfirmationNeeded,
  notifyJobMarkedComplete,
  notifyJobCompleted,
  notifyPaymentReleased,
  notifyDisputeOpened,
  notifyDisputeUnderInvestigation,
  notifyRefundApproved,
  notifyCustomerRefundProcessed,
  notifyProviderRefundClawback,
  notifyProviderRefundOutcome,
  notifyCaseClosed,
  notifyStagedRefundApproved,
  notifyProviderStagedRefundOutcome,
  notifyCustomerStagedRefundPayout,
  notifyCustomerRepaymentFunded,
  notifyProviderRepaymentSubmitted,
  notifyProviderRepaymentConfirmed,
  notifyProviderRepaymentRejected,
  notifyProviderRefundDebtReminder,
  notifyAccountBlocked,
  notifyAccountUnblocked,
  notifyProviderRefundDebtOverdue,
  notifyCustomerRefundDebtOverdue,
  notifyAdminRefundRepaymentSubmitted,
  notifyAdminRefundDebtOverdue,
  queueEmail,
  queueEmailStub,
  jobDedupe,
  materialOrderDedupe,
};
