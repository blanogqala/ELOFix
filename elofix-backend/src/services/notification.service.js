const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");

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

async function addNotification(notification) {
  let conversationId = null;
  if (notification.senderId) {
    conversationId = await createConversationForNotification({
      senderId: notification.senderId,
      jobId: notification.jobId,
      conversationType: notification.conversationType || "job",
    });
  }

  const item = await prisma.notification.create({
    data: {
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
      conversationId,
    },
  });
  const apiItem = toApiShape(item);
  emitToUserRoom(apiItem.userId, "notification:new", apiItem);
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

/**
 * In-app notification for the supplier org owner (User row) for material-order events.
 */
async function notifySupplierOrgOwnerMaterialEvent(supplierOrgId, { type, title, message, materialOrderId, jobId }) {
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
  });
}

module.exports = {
  getNotifications,
  addNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  notifySupplierOrgOwnerMaterialEvent,
};
