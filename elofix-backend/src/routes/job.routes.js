const express = require("express");
const jobController = require("../controllers/job.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", authenticate, asyncHandler(jobController.getJobs));
router.post("/", authenticate, asyncHandler(jobController.createJob));
router.get("/match", authenticate, asyncHandler(jobController.getMatchedJobs));
router.get("/:id", authenticate, asyncHandler(jobController.getJobById));
router.patch("/:id/accept", authenticate, asyncHandler(jobController.acceptJob));
router.delete("/:id", authenticate, asyncHandler(jobController.deleteJob));

router.post("/:id/materials", authenticate, asyncHandler(jobController.addMaterials));
router.delete("/:id/materials", authenticate, asyncHandler(jobController.removeMaterial));
router.post("/:id/notes", authenticate, asyncHandler(jobController.addJobNote));
router.post("/:id/chat", authenticate, asyncHandler(jobController.addChatMessage));
router.patch("/:id/status", authenticate, asyncHandler(jobController.updateJobStatus));
router.patch("/:id/reject-by-provider", authenticate, asyncHandler(jobController.rejectJobByProvider));
router.delete(
  "/:id/provider-view/rejected",
  authenticate,
  asyncHandler(jobController.deleteRejectedFromProviderView)
);
router.patch(
  "/:id/provider-requirements",
  authenticate,
  asyncHandler(jobController.updateProviderRequirements)
);

router.post("/:id/service-price", authenticate, asyncHandler(jobController.submitServicePrice));
router.post("/:id/pay-labor", authenticate, asyncHandler(jobController.payLabor));
router.post("/:id/invoices/labor", authenticate, asyncHandler(jobController.createLaborInvoice));
router.get("/:id/invoices/labor", authenticate, asyncHandler(jobController.getLaborInvoice));
router.post("/:id/escrow/release", authenticate, asyncHandler(jobController.releaseEscrowPayment));

router.post("/:id/materials/submit", authenticate, asyncHandler(jobController.submitMaterials));
router.patch("/:id/reject", authenticate, asyncHandler(jobController.rejectJob));
router.post(
  "/:id/user-material-suggestions",
  authenticate,
  asyncHandler(jobController.addUserMaterialSuggestion)
);
router.patch(
  "/:id/user-suggestions/:suggestionId/accept",
  authenticate,
  asyncHandler(jobController.acceptUserSuggestion)
);
router.patch(
  "/:id/user-suggestions/:suggestionId/reject",
  authenticate,
  asyncHandler(jobController.rejectUserSuggestion)
);
router.post(
  "/:id/provider-material-suggestions",
  authenticate,
  asyncHandler(jobController.addProviderMaterialSuggestion)
);
router.patch(
  "/:id/provider-suggestions/:suggestionId/accept",
  authenticate,
  asyncHandler(jobController.acceptProviderSuggestion)
);
router.patch(
  "/:id/provider-suggestions/:suggestionId/reject",
  authenticate,
  asyncHandler(jobController.rejectProviderSuggestion)
);

router.post("/:id/proposed-price", authenticate, asyncHandler(jobController.proposeNewLaborPrice));
router.patch(
  "/:id/proposed-price/accept",
  authenticate,
  asyncHandler(jobController.acceptProposedPrice)
);

router.post("/:id/cancel", authenticate, asyncHandler(jobController.cancelJob));
router.post("/:id/confirm-completion", authenticate, asyncHandler(jobController.confirmJobCompletion));

router.patch(
  "/:id/store-orders/:storeId/delivery-option",
  authenticate,
  asyncHandler(jobController.setStoreDeliveryOption)
);
router.patch(
  "/:id/store-orders/:storeId/approve-request",
  authenticate,
  asyncHandler(jobController.approveStoreDeliveryRequest)
);
router.patch(
  "/:id/store-orders/:storeId/delivery-status",
  authenticate,
  asyncHandler(jobController.updateStoreOrderDeliveryStatus)
);
router.patch(
  "/:id/store-orders/:storeId/delivery",
  authenticate,
  asyncHandler(jobController.updateStoreOrderDelivery)
);
router.patch(
  "/:id/store-orders/:storeId/approve",
  authenticate,
  asyncHandler(jobController.approveStoreOrderDelivery)
);
router.patch(
  "/:id/store-orders/:storeId/reject",
  authenticate,
  asyncHandler(jobController.rejectStoreOrderDelivery)
);
router.post(
  "/:id/store-orders/:storeId/pay-delivery",
  authenticate,
  asyncHandler(jobController.payStoreOrderDelivery)
);
router.post(
  "/:id/store-orders/:storeId/pay-materials",
  authenticate,
  asyncHandler(jobController.payForStoreMaterials)
);

module.exports = router;
