const prisma = require("../config/prisma");
const notificationService = require("../services/notification.service");

async function getNotifications(req, res) {
  const requested = String(req.query.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && requested !== req.user.userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const notifications = await notificationService.getNotifications(requested);
  res.json({ success: true, notifications });
}

async function addNotification(req, res) {
  const body = req.body || {};
  const targetUserId = String(body.userId ?? "");
  if (req.user.role !== "ADMIN" && targetUserId !== req.user.userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const notification = await notificationService.addNotification(body);
  res.status(201).json({ success: true, notification });
}

async function createSupportNotifications(req, res) {
  const message = String(req.body?.message || "").trim();
  if (message.length < 1 || message.length > 2000) {
    return res.status(400).json({ success: false, message: "Message must be 1–2000 characters" });
  }
  const sender = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!sender) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const title = "Support message";
  const fullMessage = `${sender.name} (${sender.email}): ${message}`;
  await Promise.all(
    admins.map((admin) =>
      notificationService.addNotification({
        userId: admin.id,
        type: "support_contact",
        title,
        message: fullMessage,
      })
    )
  );
  res.status(201).json({ success: true });
}

async function markAsRead(req, res) {
  const userId = String(req.body?.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && userId !== req.user.userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  await notificationService.markAsRead(userId, req.params.notificationId);
  res.json({ success: true });
}

async function markAllAsRead(req, res) {
  const userId = String(req.body?.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && userId !== req.user.userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  await notificationService.markAllAsRead(userId);
  res.json({ success: true });
}

async function getUnreadCount(req, res) {
  const userId = String(req.query.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && userId !== req.user.userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const count = await notificationService.getUnreadCount(userId);
  res.json({ success: true, count });
}

module.exports = {
  getNotifications,
  addNotification,
  createSupportNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
