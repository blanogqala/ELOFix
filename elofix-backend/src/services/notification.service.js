const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");

function toApiShape(row) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read,
    jobId: row.jobId || undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

async function getNotifications(userId) {
  const list = await prisma.notification.findMany({
    where: { userId: String(userId) },
    orderBy: { createdAt: "desc" },
  });
  return list.map(toApiShape);
}

async function addNotification(notification) {
  const item = await prisma.notification.create({
    data: {
      id: randomUUID(),
      userId: String(notification.userId),
      type: String(notification.type || "job_completed"),
      title: String(notification.title || "Notification"),
      message: String(notification.message || ""),
      read: false,
      jobId: notification.jobId || null,
    },
  });
  return toApiShape(item);
}

async function markAsRead(userId, notificationId) {
  await prisma.notification.updateMany({
    where: { userId: String(userId), id: notificationId },
    data: { read: true },
  });
}

async function markAllAsRead(userId) {
  await prisma.notification.updateMany({
    where: { userId: String(userId) },
    data: { read: true },
  });
}

async function getUnreadCount(userId) {
  return prisma.notification.count({
    where: { userId: String(userId), read: false },
  });
}

module.exports = {
  getNotifications,
  addNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
