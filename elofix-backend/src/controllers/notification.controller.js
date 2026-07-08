const prisma = require("../config/prisma");
const notificationService = require("../services/notification.service");
const branchStaffNotificationService = require("../services/branchStaffNotification.service");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

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
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const title = "Support message";

  let senderName;
  /** Must reference User.id when set — BranchUser IDs are not valid FK targets. */
  let senderUserIdForNotify = null;
  let senderRoleFormatted;
  let fullMessage;
  let branchUserIdForNotify = null;

  if (req.user.role === "BRANCH_STAFF") {
    const bu = await prisma.branchUser.findUnique({
      where: { id: String(req.user.userId) },
    });
    if (!bu) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    senderName = "Branch staff";
    senderRoleFormatted = "branch_staff";
    fullMessage = `${senderName}: ${message}`;
    branchUserIdForNotify = bu.id;
  } else {
    const sender = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!sender) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    senderName = sender.name;
    senderUserIdForNotify = sender.id;
    const roleUp = String(sender.role || "").toUpperCase();
    senderRoleFormatted =
      roleUp === "CUSTOMER"
        ? "customer"
        : roleUp === "SUPPLIER"
          ? "supplier"
          : roleUp === "PROVIDER"
            ? "provider"
            : String(sender.role || "user").toLowerCase();
    fullMessage = `${sender.name}: ${message}`;
  }

  await Promise.all(
    admins.map((admin) =>
      notificationService.addNotification({
        userId: admin.id,
        type: "support_contact",
        title,
        message: fullMessage,
        ...(senderUserIdForNotify ? { senderId: senderUserIdForNotify } : {}),
        ...(branchUserIdForNotify ? { branchUserId: branchUserIdForNotify } : {}),
        senderName,
        senderRole: senderRoleFormatted,
        conversationType: "support",
      })
    )
  );

  if (branchUserIdForNotify) {
    await branchStaffNotificationService.createForBranchUser(branchUserIdForNotify, {
      category: "SYSTEM",
      type: "support_contact",
      title,
      message: fullMessage,
      metadata: {
        senderId: branchUserIdForNotify,
        senderName,
        senderRole: senderRoleFormatted,
      },
    });
  } else if (senderUserIdForNotify) {
    await notificationService.addNotification({
      userId: senderUserIdForNotify,
      type: "support_contact",
      title,
      message: fullMessage,
      senderId: senderUserIdForNotify,
      senderName,
      senderRole: senderRoleFormatted,
      conversationType: "support",
    });
  }

  res.status(201).json({ success: true });
}

async function replySupportAsAdmin(req, res) {
  const targetUserId = String(req.body?.userId || "").trim();
  const branchUserId = String(req.body?.branchUserId || "").trim();
  const message = String(req.body?.message || "").trim();

  if (message.length < 1 || message.length > 2000) {
    return res.status(400).json({ success: false, message: "Message must be 1–2000 characters" });
  }

  const admin = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!admin) {
    return res.status(404).json({ success: false, message: "Admin not found" });
  }

  if (branchUserId) {
    if (!isUuid(branchUserId)) {
      return res.status(400).json({ success: false, message: "branchUserId must be a valid UUID" });
    }
    const branchUser = await prisma.branchUser.findUnique({ where: { id: branchUserId } });
    if (!branchUser) {
      return res.status(404).json({ success: false, message: "Branch staff member not found" });
    }
    await branchStaffNotificationService.createForBranchUser(branchUserId, {
      category: "SYSTEM",
      type: "support_reply",
      title: "Support",
      message,
      metadata: {
        senderId: admin.id,
        senderName: admin.name,
        senderRole: "admin",
      },
    });
    await notificationService.addNotification({
      userId: admin.id,
      type: "support_reply",
      title: "Support",
      message,
      senderId: admin.id,
      senderName: admin.name,
      senderRole: "admin",
      branchUserId,
      conversationType: "support",
    });
    return res.status(201).json({ success: true });
  }

  if (!targetUserId) {
    return res.status(400).json({ success: false, message: "userId is required" });
  }
  if (!isUuid(targetUserId)) {
    return res.status(400).json({
      success: false,
      message: "userId must be a valid user UUID (select a support thread, do not enter a display name)",
    });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await notificationService.addNotification({
    userId: targetUserId,
    type: "support_reply",
    title: "Support",
    message,
    senderId: admin.id,
    senderName: admin.name,
    senderRole: "admin",
    conversationType: "support",
  });

  await notificationService.addNotification({
    userId: admin.id,
    type: "support_reply",
    title: "Support",
    message,
    senderId: admin.id,
    senderName: admin.name,
    senderRole: "admin",
    conversationType: "support",
    supportTargetUserId: targetUserId,
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

async function markJobNotificationsRead(req, res) {
  if (req.user.role === "BRANCH_STAFF") {
    return res.status(400).json({ success: false, message: "Not supported for branch staff" });
  }
  const userId = String(req.body?.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && userId !== req.user.userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const jobId = String(req.params.jobId || "").trim();
  if (!jobId) {
    return res.status(400).json({ success: false, message: "jobId is required" });
  }
  const section = String(req.body?.section || "all").trim() || "all";
  const count = await notificationService.markJobNotificationsRead(userId, jobId, section);
  res.json({ success: true, count });
}

async function markNavNotificationsRead(req, res) {
  if (req.user.role === "BRANCH_STAFF") {
    return res.status(400).json({ success: false, message: "Not supported for branch staff" });
  }
  const userId = String(req.body?.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && userId !== req.user.userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const navPath = String(req.body?.navPath || "").trim();
  if (!navPath) {
    return res.status(400).json({ success: false, message: "navPath is required" });
  }
  const result = await notificationService.markNavNotificationsRead(userId, navPath);
  if (result.invalid) {
    return res.status(400).json({ success: false, message: "Invalid navPath" });
  }
  res.json({ success: true, count: result.count });
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
  markJobNotificationsRead,
  markNavNotificationsRead,
  getUnreadCount,
};
