const express = require("express");
const ratingController = require("../controllers/rating.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.post(
  "/",
  authorizeRoles("CUSTOMER"),
  asyncHandler(ratingController.postMaterialOrderRating)
);

module.exports = router;
