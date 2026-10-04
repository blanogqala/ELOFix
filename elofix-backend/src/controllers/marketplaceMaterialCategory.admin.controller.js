const AppError = require("../utils/AppError");
const { filePathToPublicUrl } = require("../middleware/upload.middleware");
const { registerUploadedFile } = require("../services/fileStorage.service");
const { validateUploadedImageFile } = require("../utils/uploadSecurity.util");
const marketplaceCategoryService = require("../services/marketplaceMaterialCategory.service");

async function list(req, res) {
  const categories = await marketplaceCategoryService.listForAdmin();
  res.json({ success: true, categories });
}

async function create(req, res) {
  const category = await marketplaceCategoryService.createCategory(req.body || {});
  res.status(201).json({ success: true, category });
}

async function update(req, res) {
  const category = await marketplaceCategoryService.updateCategory(req.params.id, req.body || {});
  res.json({ success: true, category });
}

async function assignSupplier(req, res) {
  const assignment = await marketplaceCategoryService.assignCategoriesForAdmin(
    req.params.supplierId,
    req.body || {}
  );
  res.json({ success: true, assignment });
}

async function uploadImage(req, res) {
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  await validateUploadedImageFile(req.file);
  const stored = await registerUploadedFile(req.file, {
    ownerUserId: req.user.userId,
    type: "marketplace_category",
  });
  const pub = req.file.path ? filePathToPublicUrl(req.file.path) : null;
  res.json({ success: true, fileId: stored.fileId, url: pub || stored.url });
}

async function remove(req, res) {
  const confirm =
    String(req.query.confirm || "").toLowerCase() === "true" || (req.body || {}).confirm === true;
  const result = await marketplaceCategoryService.deleteCategory(req.params.id, { confirm });
  if (result.requiresConfirmation) {
    return res.status(409).json({
      success: false,
      code: "CATEGORY_IN_USE",
      message: `This category is assigned to ${result.supplierCount} supplier${result.supplierCount === 1 ? "" : "s"}. Confirm to delete it. Suppliers, branches, products, and orders are not deleted.`,
      supplierCount: result.supplierCount,
    });
  }
  res.json({ success: true, deleted: true, supplierCount: result.supplierCount });
}

module.exports = {
  list,
  create,
  update,
  uploadImage,
  remove,
  assignSupplier,
};
