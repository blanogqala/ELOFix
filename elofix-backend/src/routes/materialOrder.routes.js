const express = require("express");
const materialOrderController = require("../controllers/materialOrder.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/", asyncHandler(materialOrderController.getMaterialOrders));
router.get("/all", asyncHandler(materialOrderController.getAllMaterialOrdersForUser));
router.get(
  "/delivery-inbox",
  authorizeRoles("PROVIDER"),
  asyncHandler(materialOrderController.getDeliveryInbox)
);
router.get("/:id", asyncHandler(materialOrderController.getMaterialOrder));
router.post("/", asyncHandler(materialOrderController.createMaterialOrder));
router.patch("/:id/delivery", asyncHandler(materialOrderController.updateMaterialOrderDelivery));
router.patch("/:id/delivery/approve", asyncHandler(materialOrderController.approveMaterialOrderDelivery));
router.patch("/:id/delivery/reject", asyncHandler(materialOrderController.rejectMaterialOrderDelivery));
router.patch(
  "/:id/delivery/quote",
  authorizeRoles("PROVIDER"),
  asyncHandler(materialOrderController.submitDeliveryQuote)
);
router.patch(
  "/:id/delivery/reject-request",
  authorizeRoles("PROVIDER"),
  asyncHandler(materialOrderController.rejectDeliveryRequest)
);
router.patch(
  "/:id/delivery/accept-quote",
  authorizeRoles("CUSTOMER"),
  asyncHandler(materialOrderController.acceptDeliveryQuote)
);
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
router.patch(
  "/:id/confirm-collection",
  authorizeRoles("CUSTOMER"),
  asyncHandler(materialOrderController.confirmDeliveryReceipt)
);
router.post(
  "/:id/report-delivery-issue",
  authorizeRoles("CUSTOMER"),
  asyncHandler(materialOrderController.reportDeliveryIssue)
);
router.post(
  "/:id/cancel",
  authorizeRoles("CUSTOMER"),
  asyncHandler(materialOrderController.cancelMaterialOrder)
);

module.exports = router;
