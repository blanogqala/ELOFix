const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const trackingController = require("../controllers/tracking.controller");

const router = express.Router();

router.get("/latest/:orderId", authenticate, asyncHandler(trackingController.getLatestForOrder));
router.get("/:trackingId", asyncHandler(trackingController.getByTrackingId));
router.post("/update", asyncHandler(trackingController.postUpdate));

module.exports = router;
