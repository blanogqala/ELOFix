const express = require("express");
const providerController = require("../controllers/provider.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");
const {
  uploadProviderDocument,
  uploadProviderAvatar,
  uploadWorkPostImage,
} = require("../middleware/upload.middleware");
const { uploadRateLimit } = require("../middleware/uploadRateLimit.middleware");
const { UPLOAD_CATEGORIES } = require("../services/uploadRateLimit.service");

const router = express.Router();

router.get("/", asyncHandler(providerController.listProviders));
router.get("/:id/reviews", asyncHandler(providerController.listProviderReviews));
router.get("/:id/completed-projects", asyncHandler(providerController.listCompletedProjects));
router.get("/:id", asyncHandler(providerController.getProvider));

router.post(
  "/:id/avatar",
  authenticate,
  authorizeRoles(["PROVIDER", "ADMIN"]),
  uploadProviderAvatar.single("file"),
  asyncHandler(providerController.uploadAvatarScoped)
);

router.post(
  "/:id/work-images",
  authenticate,
  authorizeRoles(["PROVIDER", "ADMIN"]),
  uploadWorkPostImage.single("file"),
  asyncHandler(providerController.uploadWorkPostImageScoped)
);

router.post(
  "/:id/documents/:docType",
  authenticate,
  authorizeRoles(["PROVIDER"]),
  uploadProviderDocument.single("file"),
  uploadRateLimit(UPLOAD_CATEGORIES.PROVIDER_DOCUMENT),
  asyncHandler(providerController.uploadDocumentScoped)
);

router.patch(
  "/:id",
  authenticate,
  authorizeRoles(["PROVIDER", "ADMIN"]),
  asyncHandler(providerController.updateProviderScoped)
);

module.exports = router;
