const marketplaceCategoryService = require("../services/marketplaceMaterialCategory.service");
const branchService = require("../services/branch.service");

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

async function assignBranch(req, res) {
  const branchId = await marketplaceCategoryService.assignCategoriesForAdmin(
    req.params.supplierId,
    req.params.branchId,
    (req.body || {}).categoryIds
  );
  const full = await branchService.getBranchByIdWithSupplier(branchId);
  res.json({
    success: true,
    branch: branchService.branchToPublicApi(full, full.supplier, { omitInternal: false }),
  });
}

module.exports = {
  list,
  create,
  update,
  assignBranch,
};
