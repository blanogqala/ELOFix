const express = require("express");
const disputeController = require("../controllers/dispute.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", authenticate, asyncHandler(disputeController.listDisputes));
router.get("/provider-stats", authenticate, asyncHandler(disputeController.getProviderDisputeStats));
router.get("/:id", authenticate, asyncHandler(disputeController.getDispute));
router.post("/:id/messages", authenticate, asyncHandler(disputeController.addMessage));
router.post("/:id/evidence", authenticate, asyncHandler(disputeController.addEvidence));
router.post("/:id/provider-evidence", authenticate, asyncHandler(disputeController.addProviderEvidence));

module.exports = router;
