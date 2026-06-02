const express = require("express");
const adminController = require("../controllers/admin.controller");
const paymentController = require("../controllers/payment.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(["ADMIN"]));

router.get("/material-orders", asyncHandler(adminController.listAllPlatformMaterialOrders));
router.get("/analytics", asyncHandler(adminController.getAnalytics));
router.post("/payments/force-settle", asyncHandler(paymentController.adminForceSettle));

router.get("/financial-summary", asyncHandler(adminController.getFinancialSummaryEndpoint));
router.get("/commissions", asyncHandler(adminController.getCommissions));
router.get("/reconcile/:providerId", asyncHandler(adminController.getReconcileProvider));
router.get("/customers", asyncHandler(adminController.listCustomers));
router.get("/customers/:userId", asyncHandler(adminController.getCustomerById));
router.patch("/customers/:userId/block", asyncHandler(adminController.blockCustomer));
router.patch("/customers/:userId/unblock", asyncHandler(adminController.unblockCustomer));
router.patch("/customers/:userId/delete", asyncHandler(adminController.deleteCustomer));
router.get("/providers", asyncHandler(adminController.listProviders));
router.get("/providers/revenue-summary", asyncHandler(adminController.listProviderNetRevenues));
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
router.patch("/category-suggestions/:id/reject", asyncHandler(adminController.rejectCategorySuggestion));

router.get("/withdrawals", asyncHandler(adminController.listWithdrawals));
router.patch("/withdrawals/:id/approve", asyncHandler(adminController.approveWithdrawal));
router.patch("/withdrawals/:id/mark-paid", asyncHandler(adminController.markWithdrawalPaid));
router.patch("/withdrawals/:id/mark-failed", asyncHandler(adminController.markWithdrawalFailed));

router.get("/suppliers", asyncHandler(adminController.listSuppliers));
router.post("/suppliers", asyncHandler(adminController.createSupplier));
router.get("/suppliers/:supplierId/material-orders", asyncHandler(adminController.listSupplierMaterialOrders));
router.get("/suppliers/:supplierId/orders/export", asyncHandler(adminController.getAdminSupplierOrdersExport));
router.get("/suppliers/:supplierId/orders", asyncHandler(adminController.listSupplierOrders));
router.get("/suppliers/:supplierId", asyncHandler(adminController.getAdminSupplierDetail));

module.exports = router;
