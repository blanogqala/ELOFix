const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");
const outboxService = require("./notificationDeliveryOutbox.service");

function emitToUserRoom(userId, event, payload) {
  if (!userId || !global.io) return;
  try {
    global.io.to(String(userId)).emit(event, payload);
  } catch (err) {
    console.error("[socket] emit failed", err);
  }
}

function toApiShape(row) {
  return {
    id: row.id,
    userId: row.userId,
    senderId: row.senderId || undefined,
    senderName: row.senderName || undefined,
    senderRole: row.senderRole || undefined,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read,
    jobId: row.jobId || undefined,
    materialOrderId: row.materialOrderId || undefined,
    branchUserId: row.branchUserId || undefined,
    supportTargetUserId: row.supportTargetUserId || undefined,
    conversationId: row.conversationId || undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

async function createConversationForNotification({ senderId, jobId, conversationType = "job" }) {
  if (!senderId) return null;
  const conv = await prisma.conversation.create({
    data: {
      id: randomUUID(),
      senderId: String(senderId),
      jobId: jobId != null && String(jobId).trim() !== "" ? String(jobId) : null,
      conversationType: String(conversationType || "job"),
    },
  });
  return conv.id;
}

async function getNotifications(userId) {
  const list = await prisma.notification.findMany({
    where: { userId: String(userId) },
    orderBy: { createdAt: "desc" },
  });
  return list.map(toApiShape);
}

function buildNotificationData(notification) {
  return {
    id: randomUUID(),
    userId: String(notification.userId),
    senderId: notification.senderId ? String(notification.senderId) : null,
    senderName: notification.senderName != null ? String(notification.senderName) : null,
    senderRole: notification.senderRole != null ? String(notification.senderRole) : null,
    type: String(notification.type || "job_completed"),
    title: String(notification.title || "Notification"),
    message: String(notification.message || ""),
    read: false,
    jobId: notification.jobId || null,
    materialOrderId:
      notification.materialOrderId != null && String(notification.materialOrderId).trim() !== ""
        ? String(notification.materialOrderId).trim()
        : null,
    branchUserId:
      notification.branchUserId != null && String(notification.branchUserId).trim() !== ""
        ? String(notification.branchUserId).trim()
        : null,
    supportTargetUserId:
      notification.supportTargetUserId != null && String(notification.supportTargetUserId).trim() !== ""
        ? String(notification.supportTargetUserId).trim()
        : null,
    dedupeKey:
      notification.dedupeKey != null && String(notification.dedupeKey).trim() !== ""
        ? String(notification.dedupeKey).trim()
        : null,
  };
}

async function addNotification(notification) {
  let conversationId = null;
  if (notification.senderId && notification.conversationType !== "support") {
    conversationId = await createConversationForNotification({
      senderId: notification.senderId,
      jobId: notification.jobId,
      conversationType: notification.conversationType || "job",
    });
  }

  const data = buildNotificationData(notification);
  let item;
  let deduped = false;

  if (data.dedupeKey) {
    const existing = await prisma.notification.findFirst({
      where: { userId: data.userId, dedupeKey: data.dedupeKey },
    });
    if (existing) {
      item = existing;
      deduped = true;
    }
  }

  if (!item) {
    try {
      item = await prisma.notification.create({
        data: { ...data, conversationId },
      });
    } catch (err) {
      if (err?.code === "P2002" && data.dedupeKey) {
        const existing = await prisma.notification.findFirst({
          where: { userId: data.userId, dedupeKey: data.dedupeKey },
        });
        if (!existing) throw err;
        item = existing;
        deduped = true;
      } else {
        throw err;
      }
    }
  }

  const apiItem = toApiShape(item);

  if (deduped) {
    void logAudit(AUDIT_ACTIONS.NOTIFICATION_DEDUPED, {
      userId: apiItem.userId,
      entityType: ENTITY_TYPES.NOTIFICATION,
      entityId: apiItem.id,
      newValue: {
        type: apiItem.type,
        dedupeKey: data.dedupeKey,
        jobId: apiItem.jobId,
        materialOrderId: apiItem.materialOrderId,
      },
    });
    return apiItem;
  }

  void logAudit(AUDIT_ACTIONS.NOTIFICATION_CREATED, {
    userId: apiItem.userId,
    entityType: ENTITY_TYPES.NOTIFICATION,
    entityId: apiItem.id,
    newValue: {
      type: apiItem.type,
      dedupeKey: data.dedupeKey,
      jobId: apiItem.jobId,
      materialOrderId: apiItem.materialOrderId,
    },
  });

  try {
    await outboxService.enqueueSocketDelivery({
      notificationId: apiItem.id,
      userId: apiItem.userId,
      event: "notification:new",
      payload: apiItem,
    });
    void outboxService.processOutboxBatch(1);
  } catch (outboxErr) {
    console.error("[notifications] socket outbox enqueue failed", outboxErr);
    emitToUserRoom(apiItem.userId, "notification:new", apiItem);
  }

  return apiItem;
}

async function markAsRead(userId, notificationId) {
  await prisma.notification.updateMany({
    where: { userId: String(userId), id: notificationId },
    data: { read: true },
  });
  emitToUserRoom(userId, "notification:read", { notificationId: String(notificationId) });
}

async function markAllAsRead(userId) {
  await prisma.notification.updateMany({
    where: { userId: String(userId) },
    data: { read: true },
  });
  emitToUserRoom(userId, "notification:read-all", { userId: String(userId) });
}

async function getUnreadCount(userId) {
  return prisma.notification.count({
    where: { userId: String(userId), read: false },
  });
}

const JOB_SECTION_TYPES = {
  materials: [
    "material_list_submitted",
    "material_suggestion_received",
    "material_list_replaced",
    "provider_suggestion",
    "material_paid",
    "material_suggestion_accepted",
    "material_suggestion_rejected",
    "payment_made",
  ],
  messages: ["job_chat"],
  general: [
    "job_request",
    "job_accepted",
    "inspection_completed",
    "price_submitted",
    "delivery_update",
    "provider_accepted",
    "provider_rejected",
    "job_completed",
    "confirmation_needed",
    "job_marked_complete",
    "dispute_opened",
    "dispute_under_investigation",
    "refund_approved",
    "refund_processed",
    "refund_clawback",
    "case_closed",
    "payment_released",
    "job_cancelled",
    "material_tracking",
  ],
};

/**
 * Mark unread job-scoped notifications read, optionally filtered by UI section.
 * @param {'all'|'materials'|'messages'|'general'} section
 */
async function markJobNotificationsRead(userId, jobId, section = "all") {
  const uid = String(userId);
  const jid = String(jobId);
  const where = { userId: uid, jobId: jid, read: false };
  if (section && section !== "all") {
    const types = JOB_SECTION_TYPES[section];
    if (!types?.length) return 0;
    where.type = { in: types };
  }
  const result = await prisma.notification.updateMany({
    where,
    data: { read: true },
  });
  emitToUserRoom(uid, "notification:job-read", { jobId: jid, section: section || "all" });
  return result.count;
}

// Exclude job_chat: Messages tab badges clear only via markJobNotificationsRead(section: "messages").
const JOBS_NAV_TYPES = [
  ...JOB_SECTION_TYPES.materials,
  ...JOB_SECTION_TYPES.general.filter((t) => t !== "job_request"),
];

const MATERIAL_ORDER_NAV_TYPES = [
  "material_tracking",
  "delivery_update",
  "delivery_quote",
  "material_list_submitted",
];

const SUPPLIER_ORDER_NAV_TYPES = [
  "supplier_material_order_new",
  "supplier_material_order_cancelled",
  "material_order_new",
  "material_order_cancelled",
];

const WITHDRAWAL_NAV_TYPES = [
  "withdrawal_approved",
  "withdrawal_paid",
  "withdrawal_failed",
];

const NAV_PATH_TYPES = {
  "/admin/providers": ["admin_provider_application_submitted"],
  "/admin/categories": ["category_suggestion"],
  "/admin/fraud-center": ["fraud_alert"],
  "/admin/refund-repayments": ["admin_repayment_submitted", "admin_refund_debt_overdue"],
  "/user/jobs": JOBS_NAV_TYPES,
  "/user/material-orders": MATERIAL_ORDER_NAV_TYPES,
  "/provider/jobs": JOBS_NAV_TYPES,
  "/provider/requests": ["job_request"],
  "/provider/earnings": WITHDRAWAL_NAV_TYPES,
  "/provider/profile": [
    "provider_application_submitted",
    "provider_application_rejected",
    "provider_document_rejected",
    "provider_approved",
  ],
  "/supplier/orders": SUPPLIER_ORDER_NAV_TYPES,
  "/supplier/earnings": WITHDRAWAL_NAV_TYPES,
};

const JOBS_NAV_PATHS = new Set(["/user/jobs", "/provider/jobs"]);

/**
 * Mark unread notifications read for a sidebar nav path (bulk clearance on page visit).
 */
async function markNavNotificationsRead(userId, navPath) {
  const uid = String(userId);
  const path = String(navPath || "").trim();
  const types = NAV_PATH_TYPES[path];
  if (!types?.length) {
    return { count: 0, invalid: true };
  }

  const where = {
    userId: uid,
    read: false,
    type: { in: types },
  };
  if (JOBS_NAV_PATHS.has(path)) {
    where.jobId = { not: null };
  }

  const result = await prisma.notification.updateMany({
    where,
    data: { read: true },
  });
  emitToUserRoom(uid, "notification:nav-read", { navPath: path, count: result.count });
  return { count: result.count, invalid: false };
}

/**
 * In-app notification for the supplier org owner (User row) for material-order events.
 */
async function notifySupplierOrgOwnerMaterialEvent(supplierOrgId, { type, title, message, materialOrderId, jobId, dedupeKey }) {
  const sid = String(supplierOrgId || "").trim();
  if (!sid) return null;
  const supplier = await prisma.supplier.findUnique({
    where: { id: sid },
    select: { userId: true },
  });
  const ownerUserId = supplier?.userId ? String(supplier.userId) : null;
  if (!ownerUserId) return null;

  return addNotification({
    userId: ownerUserId,
    type,
    title,
    message,
    ...(materialOrderId ? { materialOrderId: String(materialOrderId) } : {}),
    ...(jobId ? { jobId: String(jobId) } : {}),
    ...(dedupeKey ? { dedupeKey: String(dedupeKey) } : {}),
  });
}

module.exports = {
  getNotifications,
  addNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  markJobNotificationsRead,
  markNavNotificationsRead,
  notifySupplierOrgOwnerMaterialEvent,
  emitToUserRoom,
  toApiShape,
  buildNotificationData,
  NAV_PATH_TYPES,
  JOB_SECTION_TYPES,
};
