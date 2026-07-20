const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { routingRateLimit } = require("../middleware/routingRateLimit.middleware");
const routingController = require("../controllers/routing.controller");

const router = express.Router();

router.get("/directions", routingRateLimit, asyncHandler(routingController.directions));

module.exports = router;
