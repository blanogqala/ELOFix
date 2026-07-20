const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { geocodeRateLimit } = require("../middleware/geocodeRateLimit.middleware");
const geocodeController = require("../controllers/geocode.controller");

const router = express.Router();

router.get("/reverse", authenticate, geocodeRateLimit, asyncHandler(geocodeController.reverse));
router.post("/reverse", authenticate, geocodeRateLimit, asyncHandler(geocodeController.reverse));
router.get("/forward", geocodeRateLimit, asyncHandler(geocodeController.forward));
router.post("/forward", geocodeRateLimit, asyncHandler(geocodeController.forward));
router.get("/search", authenticate, geocodeRateLimit, asyncHandler(geocodeController.search));
router.post("/search", authenticate, geocodeRateLimit, asyncHandler(geocodeController.search));

module.exports = router;
