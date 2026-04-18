const express = require("express");
const categoryController = require("../controllers/category.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", asyncHandler(categoryController.listCategories));
router.get("/service-areas", asyncHandler(categoryController.listServiceAreas));
router.post(
  "/suggest",
  authenticate,
  authorizeRoles(["PROVIDER"]),
  asyncHandler(categoryController.suggestCategory)
);
router.get("/:id", asyncHandler(categoryController.getCategory));

router.post(
  "/",
  authenticate,
  authorizeRoles(["ADMIN"]),
  asyncHandler(categoryController.createCategory)
);
router.patch(
  "/:id",
  authenticate,
  authorizeRoles(["ADMIN"]),
  asyncHandler(categoryController.updateCategory)
);
router.delete(
  "/:id",
  authenticate,
  authorizeRoles(["ADMIN"]),
  asyncHandler(categoryController.deleteCategory)
);

module.exports = router;

