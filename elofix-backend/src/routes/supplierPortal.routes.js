const express = require("express");
const AppError = require("../utils/AppError");
const portal = require("../controllers/supplierPortal.controller");
const branchAccount = require("../controllers/branchAccount.controller");
const supplierBranch = require("../controllers/supplierBranch.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeSupplierPortal } = require("../middleware/auth.middleware");
const financialIdem = require("../middleware/financialIdempotency.middleware");
const { uploadSupplierProductImage, uploadSupplierLogo } = require("../middleware/upload.middleware");
const { uploadRateLimit } = require("../middleware/uploadRateLimit.middleware");
const { UPLOAD_CATEGORIES } = require("../services/uploadRateLimit.service");

const router = express.Router();

router.use(authenticate);
router.use(authorizeSupplierPortal());

function ownerOnly(req, res, next) {
  if (req.user.role !== "SUPPLIER") {
    return next(new AppError("Forbidden", 403));
  }
  next();
}

router.get("/me", asyncHandler(portal.getMe));
router.patch("/branch/me", asyncHandler(portal.patchBranchMe));
router.get("/analytics/overview", asyncHandler(portal.getAnalyticsOverview));
router.get("/analytics/branches", ownerOnly, asyncHandler(portal.getAnalyticsBranches));
router.get("/branch-withdrawals", ownerOnly, asyncHandler(branchAccount.getOrgBranchWithdrawals));
router.get("/analytics/branch/:branchId/inventory", ownerOnly, asyncHandler(portal.getAnalyticsBranchInventory));
router.get("/branches", ownerOnly, asyncHandler(supplierBranch.listBranches));
router.post("/branches", ownerOnly, asyncHandler(supplierBranch.createBranch));
router.get("/branches/:branchId", ownerOnly, asyncHandler(supplierBranch.getBranch));
router.get("/branches/:branchId/balance", asyncHandler(branchAccount.getBalance));
router.get("/branches/:branchId/withdrawal-profile", asyncHandler(branchAccount.getWithdrawalProfile));
router.put("/branches/:branchId/withdrawal-profile", asyncHandler(branchAccount.putWithdrawalProfile));
router.get("/branches/:branchId/withdrawals", asyncHandler(branchAccount.getWithdrawals));
router.post(
  "/branches/:branchId/withdraw",
  financialIdem.attachFinancialRequestFingerprint,
  financialIdem.requireIdempotencyKey,
  asyncHandler(branchAccount.postWithdraw)
);
router.delete("/branches/:branchId", ownerOnly, asyncHandler(supplierBranch.deleteBranch));
router.patch("/branches/:branchId", ownerOnly, asyncHandler(supplierBranch.patchBranch));
router.get("/branches/:branchId/users", ownerOnly, asyncHandler(supplierBranch.listBranchUsers));
router.post("/branches/:branchId/users", ownerOnly, asyncHandler(supplierBranch.createBranchUser));
router.patch("/branches/:branchId/users/:branchUserId", ownerOnly, asyncHandler(supplierBranch.patchBranchUser));
router.delete("/branches/:branchId/users/:branchUserId", ownerOnly, asyncHandler(supplierBranch.deleteBranchUser));
router.get("/inventory/categories", asyncHandler(portal.getInventoryCategories));
router.post("/inventory/categories", asyncHandler(portal.postInventoryCategory));
router.get("/orders", asyncHandler(portal.getOrders));
router.get("/orders/export", asyncHandler(portal.getOrdersExport));
router.patch("/orders/:orderId/fulfillment", asyncHandler(portal.patchFulfillment));
router.patch("/orders/:orderId/delivery/approve", asyncHandler(portal.patchDeliveryApprove));
router.patch("/orders/:orderId/delivery/reject", asyncHandler(portal.patchDeliveryReject));
router.post("/orders/:orderId/cancel", asyncHandler(portal.cancelOrder));
router.post("/orders/:orderId/tracking/start", asyncHandler(portal.postEnsureTracking));
router.post("/orders/:orderId/notes", asyncHandler(portal.postOrderNote));

router.post(
  "/products/upload-image",
  uploadSupplierProductImage.single("file"),
  uploadRateLimit(UPLOAD_CATEGORIES.SUPPLIER_IMAGE),
  asyncHandler(portal.uploadProductImage)
);

router.post("/products", asyncHandler(portal.postProduct));
router.patch("/products/:productId", asyncHandler(portal.patchProduct));
router.delete("/products/:productId", asyncHandler(portal.deleteProduct));

router.patch("/profile", ownerOnly, asyncHandler(portal.patchProfile));

router.post(
  "/profile/upload-logo",
  ownerOnly,
  uploadSupplierLogo.single("file"),
  uploadRateLimit(UPLOAD_CATEGORIES.SUPPLIER_IMAGE),
  asyncHandler(portal.uploadLogo)
);

module.exports = router;
