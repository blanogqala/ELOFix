const express = require("express");
const contactController = require("../controllers/contact.controller");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/", asyncHandler(contactController.submitContactForm));

module.exports = router;
