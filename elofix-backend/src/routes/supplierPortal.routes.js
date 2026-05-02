const express = require("express");
const portal = require("../controllers/supplierPortal.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");
const { uploadSupplierProductImage, uploadSupplierLogo } = require("../middleware/upload.middleware");

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(["SUPPLIER"]));

router.get("/me", asyncHandler(portal.getMe));
router.get("/inventory/categories", asyncHandler(portal.getInventoryCategories));
router.post("/inventory/categories", asyncHandler(portal.postInventoryCategory));
router.get("/orders", asyncHandler(portal.getOrders));
router.patch("/orders/:orderId/fulfillment", asyncHandler(portal.patchFulfillment));
router.post("/orders/:orderId/tracking/start", asyncHandler(portal.postEnsureTracking));
router.post("/orders/:orderId/notes", asyncHandler(portal.postOrderNote));

router.post(
  "/products/upload-image",
  uploadSupplierProductImage.single("file"),
  asyncHandler(portal.uploadProductImage)
);

router.post("/products", asyncHandler(portal.postProduct));
router.patch("/products/:productId", asyncHandler(portal.patchProduct));
router.delete("/products/:productId", asyncHandler(portal.deleteProduct));

router.patch("/profile", asyncHandler(portal.patchProfile));

router.post(
  "/profile/upload-logo",
  uploadSupplierLogo.single("file"),
  asyncHandler(portal.uploadLogo)
);

module.exports = router;
