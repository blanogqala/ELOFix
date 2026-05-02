const express = require("express");
const materialOrderController = require("../controllers/materialOrder.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/", asyncHandler(materialOrderController.getMaterialOrders));
router.get("/all", asyncHandler(materialOrderController.getAllMaterialOrdersForUser));
router.get("/:id", asyncHandler(materialOrderController.getMaterialOrder));
router.post("/", asyncHandler(materialOrderController.createMaterialOrder));
router.patch("/:id/delivery", asyncHandler(materialOrderController.updateMaterialOrderDelivery));
router.patch("/:id/delivery/approve", asyncHandler(materialOrderController.approveMaterialOrderDelivery));
router.patch("/:id/delivery/reject", asyncHandler(materialOrderController.rejectMaterialOrderDelivery));
router.post("/:id/delivery/pay", asyncHandler(materialOrderController.payMaterialOrderDelivery));
router.patch("/:id/delivery/status", asyncHandler(materialOrderController.updateMaterialOrderDeliveryStatus));
router.patch(
  "/:id/provider-fulfillment",
  authorizeRoles("PROVIDER"),
  asyncHandler(materialOrderController.patchProviderFulfillment)
);
router.patch(
  "/:id/delivery-receipt",
  authorizeRoles("CUSTOMER"),
  asyncHandler(materialOrderController.confirmDeliveryReceipt)
);

module.exports = router;
