const express = require("express");
const legalController = require("../controllers/legal.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/versions", asyncHandler(legalController.getVersions));
router.get("/status", authenticate, asyncHandler(legalController.getLegalStatus));
router.post("/accept", authenticate, asyncHandler(legalController.acceptLegalDocuments));

module.exports = router;
