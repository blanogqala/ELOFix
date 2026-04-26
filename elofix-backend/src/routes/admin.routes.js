const express = require("express");
const adminController = require("../controllers/admin.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(["ADMIN"]));

router.get("/analytics", asyncHandler(adminController.getAnalytics));
router.get("/financial-summary", asyncHandler(adminController.getFinancialSummaryEndpoint));
router.get("/commissions", asyncHandler(adminController.getCommissions));
router.get("/reconcile/:providerId", asyncHandler(adminController.getReconcileProvider));
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

router.get("/category-suggestions", asyncHandler(adminController.listCategorySuggestions));
router.patch("/category-suggestions/:id/approve", asyncHandler(adminController.approveCategorySuggestion));

router.get("/withdrawals", asyncHandler(adminController.listWithdrawals));
router.patch("/withdrawals/:id/approve", asyncHandler(adminController.approveWithdrawal));
router.patch("/withdrawals/:id/mark-paid", asyncHandler(adminController.markWithdrawalPaid));
router.patch("/withdrawals/:id/mark-failed", asyncHandler(adminController.markWithdrawalFailed));

module.exports = router;
