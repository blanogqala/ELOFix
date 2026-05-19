const express = require("express");
const notificationController = require("../controllers/notification.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/", asyncHandler(notificationController.getNotifications));
router.get("/unread-count", asyncHandler(notificationController.getUnreadCount));
router.post("/support", asyncHandler(notificationController.createSupportNotifications));
router.post(
  "/support/reply",
  authorizeRoles(["ADMIN"]),
  asyncHandler(notificationController.replySupportAsAdmin)
);
router.post("/", asyncHandler(notificationController.addNotification));
router.patch("/job/:jobId/read", asyncHandler(notificationController.markJobNotificationsRead));
router.patch("/:notificationId/read", asyncHandler(notificationController.markAsRead));
router.patch("/read-all", asyncHandler(notificationController.markAllAsRead));

module.exports = router;
