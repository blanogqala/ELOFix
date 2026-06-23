const express = require("express");
const fraudController = require("../controllers/fraud.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/device-session", authenticate, asyncHandler(fraudController.postDeviceSession));

module.exports = router;
