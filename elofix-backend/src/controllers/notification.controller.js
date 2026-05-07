const prisma = require("../config/prisma");
const notificationService = require("../services/notification.service");
const branchStaffNotificationService = require("../services/branchStaffNotification.service");

async function getNotifications(req, res) {
  if (req.user.role === "BRANCH_STAFF") {
    const notifications = await branchStaffNotificationService.listForBranchUser(req.user.userId);
    return res.json({ success: true, notifications });
  }
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
        senderId: sender.id,
        senderName: sender.name,
        senderRole: sender.role === "CUSTOMER" ? "customer" : String(sender.role || "user").toLowerCase(),
      })
    )
  );
  res.status(201).json({ success: true });
}

async function replySupportAsAdmin(req, res) {
  const targetUserId = String(req.body?.userId || "").trim();
  const message = String(req.body?.message || "").trim();
  if (!targetUserId || message.length < 1 || message.length > 2000) {
    return res.status(400).json({ success: false, message: "userId and message (1–2000 chars) are required" });
  }
  const admin = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!admin) {
    return res.status(404).json({ success: false, message: "Admin not found" });
  }
  await notificationService.addNotification({
    userId: targetUserId,
    type: "support_reply",
    title: "Support",
    message,
    senderId: admin.id,
    senderName: admin.name,
    senderRole: "admin",
  });
  res.status(201).json({ success: true });
}

async function markAsRead(req, res) {
  if (req.user.role === "BRANCH_STAFF") {
    await branchStaffNotificationService.markAsRead(req.user.userId, req.params.notificationId);
    return res.json({ success: true });
  }
  const userId = String(req.body?.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && userId !== req.user.userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  await notificationService.markAsRead(userId, req.params.notificationId);
  res.json({ success: true });
}

async function markAllAsRead(req, res) {
  if (req.user.role === "BRANCH_STAFF") {
    await branchStaffNotificationService.markAllAsRead(req.user.userId);
    return res.json({ success: true });
  }
  const userId = String(req.body?.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && userId !== req.user.userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  await notificationService.markAllAsRead(userId);
  res.json({ success: true });
}

async function getUnreadCount(req, res) {
  if (req.user.role === "BRANCH_STAFF") {
    const count = await branchStaffNotificationService.getUnreadCount(req.user.userId);
    return res.json({ success: true, count });
  }
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
  replySupportAsAdmin,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
