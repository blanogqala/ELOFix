const notificationService = require("../services/notification.service");

async function getNotifications(req, res) {
  const userId = String(req.query.userId || req.user.userId);
  const notifications = await notificationService.getNotifications(userId);
  res.json({ success: true, notifications });
}

async function addNotification(req, res) {
  const notification = await notificationService.addNotification(req.body || {});
  res.status(201).json({ success: true, notification });
}

async function markAsRead(req, res) {
  const userId = String(req.body?.userId || req.user.userId);
  await notificationService.markAsRead(userId, req.params.notificationId);
  res.json({ success: true });
}

async function markAllAsRead(req, res) {
  const userId = String(req.body?.userId || req.user.userId);
  await notificationService.markAllAsRead(userId);
  res.json({ success: true });
}

async function getUnreadCount(req, res) {
  const userId = String(req.query.userId || req.user.userId);
  const count = await notificationService.getUnreadCount(userId);
  res.json({ success: true, count });
}

module.exports = {
  getNotifications,
  addNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
