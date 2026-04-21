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

async function notifyProviderApproved(providerUserId) {
  return notifyUser(providerUserId, {
    type: "provider_approved",
    title: "Profile approved",
    message: "Your provider profile has been approved. You can accept jobs.",
  });
}

async function notifyCategorySuggestion(adminId, suggestionName, suggestionId) {
  return notifyUser(adminId, {
    type: "category_suggestion",
    title: "New category suggestion",
    message: `A user suggested a new category: "${suggestionName}" (id: ${suggestionId}).`,
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

module.exports = {
  notifyUser,
  notifyJobRequest,
  notifyJobAccepted,
  notifyInspectionCompleted,
  notifyPriceSubmitted,
  notifyProposedPriceAccepted,
  notifyPaymentMade,
  notifyDeliveryUpdate,
  notifyProviderApproved,
  notifyCategorySuggestion,
  notifyChatMessage,
};
