const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");
const materialRequestController = require("../controllers/materialRequest.controller");

const router = express.Router();

router.post(
  "/create",
  authenticate,
  authorizeRoles(["PROVIDER"]),
  asyncHandler(materialRequestController.postCreate)
);

router.post(
  "/submit",
  authenticate,
  authorizeRoles(["PROVIDER"]),
  asyncHandler(materialRequestController.postSubmit)
);

router.get(
  "/job/:jobId",
  authenticate,
  asyncHandler(materialRequestController.getByJob)
);

router.patch(
  "/pay/:id",
  authenticate,
  authorizeRoles(["CUSTOMER"]),
  asyncHandler(materialRequestController.patchPay)
);

module.exports = router;
