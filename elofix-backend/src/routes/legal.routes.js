const express = require("express");
const legalController = require("../controllers/legal.controller");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/versions", asyncHandler(legalController.getVersions));

module.exports = router;
