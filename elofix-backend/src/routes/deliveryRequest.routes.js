const express = require("express");
const deliveryRequestController = require("../controllers/deliveryRequest.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.post("/", asyncHandler(deliveryRequestController.create));
router.get("/", asyncHandler(deliveryRequestController.listMine));
router.get(
  "/delivery-inbox",
  authorizeRoles("PROVIDER"),
  asyncHandler(deliveryRequestController.deliveryInbox)
);
router.get("/by-job/:jobId", asyncHandler(deliveryRequestController.getByJobId));
router.get("/:id", asyncHandler(deliveryRequestController.getById));
router.patch(
  "/:id/quote",
  authorizeRoles("PROVIDER"),
  asyncHandler(deliveryRequestController.submitQuote)
);
router.patch(
  "/:id/reject",
  authorizeRoles("PROVIDER"),
  asyncHandler(deliveryRequestController.rejectRequest)
);
router.patch(
  "/:id/accept-quote",
  asyncHandler(deliveryRequestController.acceptQuote)
);
router.post("/:id/pay", asyncHandler(deliveryRequestController.pay));
router.patch(
  "/:id/fulfillment",
  authorizeRoles("PROVIDER"),
  asyncHandler(deliveryRequestController.patchFulfillment)
);

module.exports = router;
