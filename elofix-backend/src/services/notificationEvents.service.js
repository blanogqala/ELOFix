const notificationService = require("./notification.service");
const outboxService = require("./notificationDeliveryOutbox.service");
const prisma = require("../config/prisma");

const NOTIFICATION_PREFERENCE_MAP = {
  job_request: "jobRequests",
  courier_delivery_request: "jobRequests",
  payment_made: "payments",
  material_paid: "payments",
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

async function notifyPaymentMade(recipientId, jobId, jobTitle, detail, paymentKind = "general") {
  const kind = String(paymentKind || "general").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return notifyUser(recipientId, {
    type: kind === "materials" ? "material_paid" : "payment_made",
    title: "Payment received",
    message: detail || `A payment was recorded for "${jobTitle || "a job"}".`,
    jobId,
    dedupeKey: jobDedupe(jobId, `payment_made:${kind}:${recipientId}`),
  });
}

async function notifyJobRejected(customerId, jobId, jobTitle) {
  return notifyUser(customerId, {
    type: "provider_rejected",
    title: "Job request rejected",
    message: `A provider rejected your job request: ${jobTitle || "Job"}.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "provider_rejected"),
  });
}

async function notifyJobCancelled(userId, jobId, jobTitle, roleLabel) {
  const role = String(roleLabel || "user").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return notifyUser(userId, {
    type: "job_cancelled",
    title: "Job cancelled",
    message: `"${jobTitle || "The job"}" has been cancelled.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `job_cancelled:${role}`),
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

async function notifyProviderApplicationSubmitted(providerUserId) {
  return notifyUser(providerUserId, {
    type: "provider_application_submitted",
    title: "Application submitted",
    message:
      "You have submitted your application to the admin. Please wait for approval.",
    dedupeKey: userDedupe(providerUserId, `provider_application_submitted:${Date.now()}`),
  });
}

async function notifyProviderApplicationRejected(providerUserId, reason) {
  const trimmed = String(reason || "").trim();
  const message = trimmed
    ? `Your provider application was rejected. Reason: ${trimmed}`
    : "Your provider application was rejected.";
  return notifyUser(providerUserId, {
    type: "provider_application_rejected",
    title: "Application rejected",
    message,
    dedupeKey: userDedupe(providerUserId, `provider_application_rejected:${Date.now()}`),
  });
}

async function notifyProviderApplicationUnrejected(providerUserId) {
  return notifyUser(providerUserId, {
    type: "provider_application_unrejected",
    title: "Application back under review",
    message:
      "Your provider application rejection was reversed. It is pending admin review again.",
    dedupeKey: userDedupe(providerUserId, `provider_application_unrejected:${Date.now()}`),
  });
}

async function notifyAdminProviderApplicationSubmitted(providerUserId, providerName) {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", deletedAt: null },
      select: { id: true },
    });
    const name = String(providerName || "A provider").trim() || "A provider";
    const uid = String(providerUserId);
    const dedupeSuffix = Date.now();
    for (const admin of admins) {
      await notificationService.addNotification({
        userId: admin.id,
        type: "admin_provider_application_submitted",
        title: "Provider application submitted",
        message: `${name} submitted their profile for verification.`,
        senderId: uid,
        senderName: name,
        senderRole: "provider",
        dedupeKey: `admin_provider_application:${uid}:${dedupeSuffix}`,
      });
    }
  } catch (err) {
    console.error("[notifications] notifyAdminProviderApplicationSubmitted failed", err);
  }
}

async function notifyProviderDocumentRejected(providerUserId, docLabel, feedback) {
  const label = String(docLabel || "document").trim() || "document";
  const trimmedFeedback = String(feedback || "").trim();
  const message = trimmedFeedback
    ? `Your ${label} was rejected. Reason: ${trimmedFeedback}`
    : `Your ${label} was rejected. Please re-upload it from your profile.`;
  return notifyUser(providerUserId, {
    type: "provider_document_rejected",
    title: "Document rejected",
    message,
    dedupeKey: userDedupe(providerUserId, `provider_document_rejected:${Date.now()}`),
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

async function notifyCompletionPaymentRequired(customerId, jobId, jobTitle) {
  await notifyUser(customerId, {
    type: "completion_payment_required",
    title: "Completion payment required",
    message: `Your provider has marked "${jobTitle || "the job"}" as ready for completion. Please review the work and pay the remaining balance.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "completion_payment_required"),
  });
}

async function notifyDepositPaymentSuccess(customerId, providerId, jobId, jobTitle) {
  await notifyUser(customerId, {
    type: "deposit_paid",
    title: "Deposit payment successful",
    message: `Your mobilisation deposit for "${jobTitle || "the job"}" was successful. The provider can now begin the service.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "deposit_paid"),
  });
  if (providerId) {
    await notifyUser(providerId, {
      type: "deposit_paid_provider",
      title: "Mobilisation deposit paid",
      message: `The customer has paid the mobilisation deposit for "${jobTitle || "the job"}". You can begin the service.`,
      jobId,
      dedupeKey: jobDedupe(jobId, "deposit_paid_provider"),
    });
  }
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
    message: `Remaining payment for "${jobTitle || "your job"}" has been recorded as payable according to the job payment schedule. Bank settlement depends on EloFix settlement configuration.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "payment_released"),
  });
}

async function notifyAdminEscrowReleased(providerId, jobId, jobTitle, amount) {
  const suffix = Number(amount) > 0 ? `admin:${Number(amount).toFixed(2)}` : "admin";
  await notifyUser(providerId, {
    type: "payment_released",
    title: "Escrow released",
    message: `Escrow payment${Number(amount) > 0 ? ` of R ${Number(amount).toFixed(2)}` : ""} for "${jobTitle || "your job"}" has been released.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `payment_released:${suffix}`),
  });
}

async function notifyDisputeOpened({ customerId, providerId, jobId, disputeId, jobTitle, cancellationActorRole }) {
  if (String(cancellationActorRole || "").toLowerCase() === "provider") {
    await notifyUser(customerId, {
      type: "dispute_opened",
      title: "Cancellation under review",
      message: `The provider cancelled "${jobTitle || "a job"}". EloFix opened a dispute review.`,
      jobId,
      dedupeKey: disputeUserDedupe(disputeId, customerId),
    });
  }
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
  let jobTitle = "your job";
  try {
    const job = await prisma.job.findUnique({
      where: { id: String(jobId) },
      select: { title: true, category: true },
    });
    jobTitle = job?.title || job?.category || "your job";
  } catch {
    /* best-effort title */
  }
  await notifyUser(customerId, {
    type: "refund_processed",
    title: "Refund processed",
    message: `Your refund of R ${Number(amount || 0).toFixed(2)} for your ${jobTitle} job has been processed successfully.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "refund_processed"),
  });
}

async function notifyMaterialSuggestionReceived(providerId, jobId, suggestionId, jobTitle) {
  await notifyUser(providerId, {
    type: "material_suggestion_received",
    title: "Material suggestion received",
    message: `The customer suggested a material for "${jobTitle || "your job"}".`,
    jobId,
    dedupeKey: jobDedupe(jobId, `suggestion:${suggestionId}:received`),
  });
}

async function notifyProviderSuggestion(customerId, jobId, suggestionId, jobTitle) {
  await notifyUser(customerId, {
    type: "provider_suggestion",
    title: "Provider material suggestion",
    message: `Your provider suggested a material for "${jobTitle || "your job"}".`,
    jobId,
    dedupeKey: jobDedupe(jobId, `suggestion:${suggestionId}:provider`),
  });
}

async function notifyMaterialSuggestionResolved(userId, jobId, suggestionId, status, jobTitle) {
  const resolved = String(status || "").toLowerCase() === "accepted" ? "accepted" : "rejected";
  await notifyUser(userId, {
    type: resolved === "accepted" ? "material_suggestion_accepted" : "material_suggestion_rejected",
    title: `Material suggestion ${resolved}`,
    message: `A material suggestion for "${jobTitle || "your job"}" was ${resolved}.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `suggestion:${suggestionId}:${resolved}`),
  });
}

async function notifyProviderReviewReceived(providerUserId, jobId, jobTitle) {
  await notifyUser(providerUserId, {
    type: "provider_review_received",
    title: "New review received",
    message: `A customer reviewed "${jobTitle || "your completed job"}".`,
    jobId,
    dedupeKey: jobDedupe(jobId, "provider_review_received"),
  });
}

async function notifyWithdrawalStatus(userId, withdrawalId, status, amount, roleLabel = "provider") {
  const normalized = String(status || "updated").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  await notifyUser(userId, {
    type: `withdrawal_${normalized}`,
    title: "Withdrawal update",
    message: `Your withdrawal of R ${Number(amount || 0).toFixed(2)} is ${normalized.replace(/_/g, " ")}.`,
    dedupeKey: `withdrawal:${roleLabel}:${withdrawalId}:${normalized}`,
  });
}

async function notifySupplierAccountReady(userId, supplierName) {
  await notifyUser(userId, {
    type: "supplier_account_ready",
    title: "Supplier account ready",
    message: `${supplierName || "Your supplier account"} is ready to use on EloFix.`,
    dedupeKey: userDedupe(userId, "supplier_account_ready"),
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
  const act = String(action || "resolved").toUpperCase();
  let customerMsg = `Dispute case closed (${act.replace(/_/g, " ").toLowerCase()}).`;
  let providerMsg = customerMsg;
  if (act === "RELEASE_FUNDS") {
    customerMsg =
      "Your dispute has been reviewed by EloFix. The remaining completion balance is now due. You have 30 calendar days to settle the outstanding amount. Failure to settle an outstanding amount within 30 calendar days may result in restrictions on new marketplace transactions, account suspension or blocking, referral for lawful debt recovery, and further legal action where appropriate.";
    providerMsg =
      "EloFix resolved the dispute in favor of releasing the remaining balance. The customer must pay the outstanding completion amount before settlement is recorded.";
  } else if (act === "FULL_REFUND") {
    customerMsg = "EloFix approved a customer refund based on amounts you have already paid.";
    providerMsg =
      "EloFix approved a customer refund. If you owe a recovery amount, settle it via the refund-due instructions in your account.";
  } else if (act === "RETURN_PROVIDER") {
    customerMsg = "EloFix instructed the provider to return to site and correct the work.";
    providerMsg = "EloFix instructed you to return to site and correct the work. Mark the job complete again when finished.";
  } else if (act === "CLOSE_CASE") {
    customerMsg = "EloFix closed the dispute without issuing a refund or releasing unpaid funds.";
    providerMsg = customerMsg;
  }
  const actionKey = String(action || "resolved").toLowerCase();
  await notifyUser(customerId, {
    type: "case_closed",
    title: act === "RELEASE_FUNDS" ? "Remaining balance due" : "Case closed",
    message: customerMsg,
    jobId,
    dedupeKey: disputeUserDedupe(disputeId, customerId) || jobDedupe(jobId, `case_closed:${actionKey}:customer`),
  });
  await notifyUser(providerId, {
    type: "case_closed",
    title: "Case closed",
    message: providerMsg,
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
      (immediate > 0
        ? `R ${immediate.toFixed(2)} is ready for processing to your original payment method where supported. `
        : "") +
      `The remaining R ${pending.toFixed(2)} depends on provider repayment (within about 30 calendar days). A refund is returned to the original payment method only after the payment service provider confirms it.`;
  } else {
    message = `Your refund of R ${net.toFixed(2)} (net of platform fee) was approved and will be processed to your original payment method where supported. Status will update when the payment service provider confirms the refund.`;
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
      `R ${debt.toFixed(2)} owed — repay by ${due} via EloFix (job repayment page or bank transfer).${ref} ` +
        `Failure to comply may result in further action under the EloFix Terms and applicable law.`
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
  const trimmed = String(reason || "").trim().slice(0, 500);
  const message = trimmed
    ? `Your account has been blocked. Reason: ${trimmed}`
    : "Your profile has been blocked. View your profile for details.";
  await notifyUser(userId, {
    type: "account_blocked",
    title: "Profile blocked",
    message,
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
    title: "Refund repayment overdue",
    message:
      `Your refund repayment of R ${Number(amountOwed || 0).toFixed(2)} is overdue. New work is restricted until the outstanding amount is settled. ` +
      `Failure to settle an approved refund repayment within 30 calendar days may result in restrictions on new work, settlement restrictions, account blocking, referral for lawful debt recovery, and further legal action where appropriate.`,
    dedupeKey: `refund_debt_overdue:${providerUserId}`,
  });
}

function formatDueDate(dueAt) {
  try {
    return new Date(dueAt).toLocaleDateString("en-ZA", { dateStyle: "medium" });
  } catch {
    return "the due date";
  }
}

async function notifyCustomerPaymentObligationCreated({ customerId, jobId, amount, dueAt, jobTitle }) {
  const amt = Number(amount || 0).toFixed(2);
  const due = formatDueDate(dueAt);
  await notifyUser(customerId, {
    type: "customer_payment_due",
    title: "Payment due",
    message: `An outstanding payment of R ${amt} is due by ${due} for ${jobTitle || "your job"}.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `customer_payment_due:${amt}`),
  });
}

async function notifyCustomerPaymentObligationReminder({ customerId, jobId, amount, dueAt, daysLeft }) {
  const amt = Number(amount || 0).toFixed(2);
  await notifyUser(customerId, {
    type: "customer_payment_reminder",
    title: daysLeft <= 1 ? "Payment due today" : "Payment reminder",
    message: `An outstanding payment of R ${amt} is due by ${formatDueDate(dueAt)} for this job.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `customer_payment_reminder:${daysLeft}`),
  });
}

async function notifyCustomerPaymentOverdue({ customerId, jobId, amount }) {
  const amt = Number(amount || 0).toFixed(2);
  await notifyUser(customerId, {
    type: "customer_payment_overdue",
    title: "Payment overdue",
    message: `Your payment of R ${amt} is overdue. New marketplace transactions are restricted until the balance is settled.`,
    jobId,
    dedupeKey: jobDedupe(jobId, "customer_payment_overdue"),
  });
}

async function notifyCustomerPaymentRestrictionCleared(customerId) {
  await notifyUser(customerId, {
    type: "customer_payment_restriction_cleared",
    title: "Marketplace access restored",
    message: "Your outstanding payment was received. New marketplace transactions are available again.",
    dedupeKey: userDedupe(customerId, "customer_payment_restriction_cleared"),
  });
}

async function notifyAdminCustomerPaymentOverdue({ customerId, jobId, amount }) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  const amt = Number(amount || 0).toFixed(2);
  for (const admin of admins) {
    await notifyUser(admin.id, {
      type: "admin_customer_payment_overdue",
      title: "Customer payment overdue",
      message: `Customer ${customerId} has an overdue service payment of R ${amt} on job ${jobId}. Marketplace restriction applied.`,
      jobId,
      dedupeKey: `admin_customer_overdue:${jobId}`,
    });
  }
}

async function notifyProviderRestrictionCleared(providerUserId) {
  await notifyUser(providerUserId, {
    type: "provider_restriction_cleared",
    title: "New-work restriction lifted",
    message: "Your refund repayment was confirmed. You can accept new work again if your account is otherwise in good standing.",
    dedupeKey: userDedupe(providerUserId, "provider_restriction_cleared"),
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
      title: "Provider refund debt overdue",
      message: `Provider ${providerUserId} has R ${Number(amountOwed || 0).toFixed(2)} overdue refund debt. New-work restriction applied.`,
      dedupeKey: `admin_overdue:${providerUserId}`,
    });
  }
}

async function notifyAdminCustomerRefundReady({ repaymentId, providerId, amount, jobIds }) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  const jobs = Array.isArray(jobIds) && jobIds.length ? ` Jobs: ${jobIds.join(", ")}.` : "";
  for (const admin of admins) {
    await notifyUser(admin.id, {
      type: "admin_refund_ready",
      title: "Customer refund ready",
      message: `Provider repayment verified (R ${Number(amount || 0).toFixed(2)}). Process customer refund.${jobs}`,
      dedupeKey: `admin_refund_ready:${repaymentId}`,
    });
  }
}

async function notifyCustomerRefundApproved({ customerId, jobId, amount }) {
  await notifyRefundApproved({ customerId, jobId, amount });
}

async function notifyCustomerRefundProcessing({ customerId, jobId, amount }) {
  await notifyUser(customerId, {
    type: "refund_processing",
    title: "Refund processing",
    message: `Your refund of R ${Number(amount || 0).toFixed(2)} is being processed back to your original payment method.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `refund_processing:${amount}`),
  });
}

async function notifyCustomerRefundFailed({ customerId, jobId, amount }) {
  await notifyUser(customerId, {
    type: "refund_failed",
    title: "Refund delayed",
    message: `Your refund of R ${Number(amount || 0).toFixed(2)} could not be completed automatically. EloFix is following up.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `refund_failed:${amount}`),
  });
}

async function notifyAdminGatewayRefundManualRequired({ jobId, repaymentId, amount, reason }) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const admin of admins) {
    await notifyUser(admin.id, {
      type: "admin_refund_manual_required",
      title: "Manual gateway refund required",
      message:
        `Job ${jobId}: process R ${Number(amount || 0).toFixed(2)} refund in the payment gateway dashboard. ` +
        `${reason || ""}`.trim(),
      jobId,
      dedupeKey: `admin_refund_manual:${repaymentId}:${jobId}`,
    });
  }
}

async function notifyAdminGatewayRefundFailed({ jobId, repaymentId, amount, reason }) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const admin of admins) {
    await notifyUser(admin.id, {
      type: "admin_refund_gateway_failed",
      title: "Gateway refund failed",
      message: `Job ${jobId}: gateway refund of R ${Number(amount || 0).toFixed(2)} failed. ${reason || ""}`.trim(),
      jobId,
      dedupeKey: `admin_refund_failed:${repaymentId}:${jobId}`,
    });
  }
}

async function notifyProviderRefundCompleted(providerId, amount, jobId) {
  await notifyUser(providerId, {
    type: "refund_completed",
    title: "Customer refund completed",
    message: `The customer refund of R ${Number(amount || 0).toFixed(2)} has been completed.`,
    jobId,
    dedupeKey: jobDedupe(jobId, `provider_refund_completed:${amount}`),
  });
}

module.exports = {
  notifyUser,
  notifyJobRequest,
  notifyJobAccepted,
  notifyJobRejected,
  notifyJobCancelled,
  notifyInspectionCompleted,
  notifyPriceSubmitted,
  notifyProposedPriceAccepted,
  notifyPaymentMade,
  notifyDeliveryUpdate,
  notifyDeliveryQuoteSubmitted,
  notifyCourierDeliveryRequest,
  notifyProviderApproved,
  notifyProviderApplicationSubmitted,
  notifyProviderApplicationRejected,
  notifyProviderApplicationUnrejected,
  notifyAdminProviderApplicationSubmitted,
  notifyProviderDocumentRejected,
  notifyAdminFraudAlert,
  notifyProviderFraudReview,
  notifyCategorySuggestion,
  notifyMaterialsListSubmitted,
  notifyChatMessage,
  notifyCustomerConfirmationNeeded,
  notifyCompletionPaymentRequired,
  notifyDepositPaymentSuccess,
  notifyJobMarkedComplete,
  notifyJobCompleted,
  notifyPaymentReleased,
  notifyAdminEscrowReleased,
  notifyDisputeOpened,
  notifyDisputeUnderInvestigation,
  notifyRefundApproved,
  notifyCustomerRefundProcessed,
  notifyProviderRefundClawback,
  notifyProviderRefundOutcome,
  notifyMaterialSuggestionReceived,
  notifyProviderSuggestion,
  notifyMaterialSuggestionResolved,
  notifyProviderReviewReceived,
  notifyWithdrawalStatus,
  notifySupplierAccountReady,
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
  notifyCustomerPaymentObligationCreated,
  notifyCustomerPaymentObligationReminder,
  notifyCustomerPaymentOverdue,
  notifyCustomerPaymentRestrictionCleared,
  notifyAdminCustomerPaymentOverdue,
  notifyProviderRestrictionCleared,
  notifyAdminRefundRepaymentSubmitted,
  notifyAdminRefundDebtOverdue,
  notifyAdminCustomerRefundReady,
  notifyCustomerRefundApproved,
  notifyCustomerRefundProcessing,
  notifyCustomerRefundFailed,
  notifyAdminGatewayRefundManualRequired,
  notifyAdminGatewayRefundFailed,
  notifyProviderRefundCompleted,
  queueEmail,
  queueEmailStub,
  jobDedupe,
  materialOrderDedupe,
};
