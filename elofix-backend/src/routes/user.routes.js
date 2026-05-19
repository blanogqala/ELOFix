const express = require("express");
const userController = require("../controllers/user.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");
const { uploadUserAvatar } = require("../middleware/upload.middleware");

const router = express.Router();

router.get("/:id", authenticate, asyncHandler(userController.getUserById));

router.patch(
  "/:id",
  authenticate,
  authorizeRoles(["CUSTOMER", "ADMIN"]),
  asyncHandler(userController.updateUserScoped)
);

router.post(
  "/:id/avatar",
  authenticate,
  authorizeRoles(["CUSTOMER", "ADMIN"]),
  uploadUserAvatar.single("file"),
  asyncHandler(userController.uploadAvatarScoped)
);

module.exports = router;
