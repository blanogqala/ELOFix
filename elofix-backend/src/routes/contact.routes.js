const express = require("express");
const contactController = require("../controllers/contact.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { contactRateLimit } = require("../middleware/ipRateLimit.middleware");

const router = express.Router();

router.post("/", contactRateLimit, asyncHandler(contactController.submitContactForm));

module.exports = router;
