const express = require("express");
const specialController = require("../controllers/special.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", asyncHandler(specialController.getDeliveryProviders));
router.post(
  "/",
  authenticate,
  authorizeRoles(["ADMIN"]),
  asyncHandler(specialController.createDeliveryProvider)
);

module.exports = router;
