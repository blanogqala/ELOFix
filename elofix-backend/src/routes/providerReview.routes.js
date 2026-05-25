const express = require("express");
const providerReviewController = require("../controllers/providerReview.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.post(
  "/",
  authenticate,
  authorizeRoles("CUSTOMER"),
  asyncHandler(providerReviewController.createReview)
);

router.get(
  "/provider/:id",
  asyncHandler(providerReviewController.listReviewsForProvider)
);

module.exports = router;
