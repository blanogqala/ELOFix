const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const geocodeController = require("../controllers/geocode.controller");

const router = express.Router();

router.get("/reverse", authenticate, asyncHandler(geocodeController.reverse));
router.post("/reverse", authenticate, asyncHandler(geocodeController.reverse));

module.exports = router;
