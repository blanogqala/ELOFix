const notificationService = require("./notification.service");

/**
 * Fire-and-forget safe: never throws to callers of job/provider flows.
 */
async function notifyUser(userId, { type, title, message, jobId }) {
  if (!userId) return;
  try {
    await notificationService.addNotification({
      userId: String(userId),
      type: String(type || "job_completed"),
      title: String(title || "Notification"),
      message: String(message || ""),
      jobId: jobId || undefined,
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
  });
}

async function notifyJobAccepted(customerId, jobId, jobTitle) {
  return notifyUser(customerId, {
    type: "job_accepted",
    title: "Job accepted",
    message: `A provider accepted your job: ${jobTitle || "Job"}`,
    jobId,
  });
}

async function notifyInspectionCompleted(customerId, jobId, jobTitle) {
  return notifyUser(customerId, {
    type: "inspection_completed",
    title: "Inspection completed",
    message: `Inspection is done for "${jobTitle || "your job"}". Check the next steps.`,
    jobId,
  });
}

async function notifyPriceSubmitted(customerId, jobId, jobTitle) {
  return notifyUser(customerId, {
    type: "price_submitted",
    title: "Price submitted",
    message: `Your provider submitted a service price for "${jobTitle || "your job"}".`,
    jobId,
  });
}

async function notifyProposedPriceAccepted(providerId, jobId, jobTitle) {
  return notifyUser(providerId, {
    type: "price_submitted",
    title: "Proposed price accepted",
    message: `The customer accepted your proposed labor price for "${jobTitle || "the job"}".`,
    jobId,
  });
}

async function notifyPaymentMade(recipientId, jobId, jobTitle, detail) {
  return notifyUser(recipientId, {
    type: "payment_made",
    title: "Payment received",
    message: detail || `A payment was recorded for "${jobTitle || "a job"}".`,
    jobId,
  });
}

async function notifyDeliveryUpdate(customerId, jobId, jobTitle, statusLabel) {
  return notifyUser(customerId, {
    type: "delivery_update",
    title: "Delivery update",
    message: `Delivery status for "${jobTitle || "your job"}": ${statusLabel || "updated"}.`,
    jobId,
  });
}

async function notifyDeliveryQuoteSubmitted(customerId, orderId, fee, jobId) {
  return notifyUser(customerId, {
    type: "delivery_quote",
    title: "Delivery quote received",
    message: `Your courier quoted R ${Number(fee || 0).toFixed(2)} for delivery. Review and pay when ready.`,
    jobId: jobId || undefined,
    orderId: String(orderId),
  });
}

async function notifyCourierDeliveryRequest(courierUserId, orderId) {
  return notifyUser(courierUserId, {
    type: "courier_delivery_request",
    title: "New delivery request",
    message: "A customer requested you for a delivery. Open your deliveries inbox to quote.",
    orderId: String(orderId),
  });
}

async function notifyProviderApproved(providerUserId) {
  return notifyUser(providerUserId, {
    type: "provider_approved",
    title: "Profile approved",
    message: "Your provider profile has been approved. You can accept jobs.",
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
    for (const admin of admins) {
      await notifyUser(admin.id, {
        type: "fraud_alert",
        title,
        message,
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
  });
}

async function notifyCategorySuggestion(adminId, suggestionName, suggestionId) {
  return notifyUser(adminId, {
    type: "category_suggestion",
    title: "New category suggestion",
    message: `A user suggested a new category: "${suggestionName}" (id: ${suggestionId}).`,
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

async function queueEmailStub({ to, subject, body }) {
  if (!to) return;
  console.log("[emailQueue:stub]", { to, subject, body: String(body || "").slice(0, 200) });
}

async function notifyCustomerConfirmationNeeded(customerId, jobId, jobTitle) {
  await notifyUser(customerId, {
    type: "confirmation_needed",
    title: "Confirm job completion",
    message: `${jobTitle || "Your job"} is awaiting your confirmation. You have 7 days to review the completed work.`,
    jobId,
  });
}

async function notifyJobMarkedComplete(providerId, jobId, jobTitle) {
  await notifyUser(providerId, {
    type: "job_marked_complete",
    title: "Job marked complete",
    message: `You marked "${jobTitle || "the job"}" as complete. Waiting for customer confirmation.`,
    jobId,
  });
}

async function notifyJobCompleted(providerId, jobId, jobTitle) {
  await notifyUser(providerId, {
    type: "job_completed",
    title: "Job completed",
    message: `"${jobTitle || "The job"}" has been marked complete.`,
    jobId,
  });
}

async function notifyPaymentReleased(providerId, jobId, jobTitle) {
  await notifyUser(providerId, {
    type: "payment_released",
    title: "Payment released",
    message: `Remaining payment for "${jobTitle || "your job"}" has been released to your account.`,
    jobId,
  });
}

async function notifyDisputeOpened({ customerId, providerId, jobId, disputeId, jobTitle }) {
  await notifyUser(providerId, {
    type: "dispute_opened",
    title: "Dispute opened",
    message: `A customer opened a dispute for "${jobTitle || "a job"}".`,
    jobId,
  });
  const admins = await require("../config/prisma").user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
    take: 20,
  });
  for (const admin of admins) {
    await notifyUser(admin.id, {
      type: "dispute_opened",
      title: "New dispute",
      message: `Dispute ${disputeId?.slice(-8) || ""} opened for job "${jobTitle || jobId}".`,
      jobId,
    });
  }
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL;
  if (supportEmail) {
    await queueEmailStub({
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
  });
  await notifyUser(providerId, {
    type: "dispute_under_investigation",
    title: "Dispute under review",
    message: "EloFix is investigating a dispute on your job.",
    jobId,
  });
}

async function notifyRefundApproved({ customerId, jobId, amount }) {
  await notifyUser(customerId, {
    type: "refund_approved",
    title: "Refund approved",
    message: `Your refund of R ${Number(amount || 0).toFixed(2)} has been approved.`,
    jobId,
  });
}

async function notifyCaseClosed({ customerId, providerId, jobId, disputeId, action }) {
  const msg = `Dispute case closed (${String(action || "resolved").replace(/_/g, " ").toLowerCase()}).`;
  await notifyUser(customerId, { type: "case_closed", title: "Case closed", message: msg, jobId });
  await notifyUser(providerId, { type: "case_closed", title: "Case closed", message: msg, jobId });
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
  notifyCaseClosed,
  queueEmailStub,
};
