const express = require("express");
const adminController = require("../controllers/admin.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(["ADMIN"]));

router.get("/providers", asyncHandler(adminController.listProviders));
router.patch(
  "/providers/:userId/documents/:docType/approve",
  asyncHandler(adminController.approveProviderDocument)
);
router.patch(
  "/providers/:userId/documents/:docType/reject",
  asyncHandler(adminController.rejectProviderDocument)
);
router.patch("/providers/:userId/approve", asyncHandler(adminController.approveProvider));
router.patch("/providers/:userId/reject", asyncHandler(adminController.rejectProvider));
router.patch("/providers/:userId/block", asyncHandler(adminController.blockProvider));
router.patch("/providers/:userId/unblock", asyncHandler(adminController.unblockProvider));
router.patch("/providers/:userId/delete", asyncHandler(adminController.deleteProvider));

module.exports = router;
