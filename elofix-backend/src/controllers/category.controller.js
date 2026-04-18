const categoryService = require("../services/category.service");

async function listCategories(req, res) {
  const includeInactive = req.query.includeInactive === "true";
  const categories = await categoryService.listCategories({ includeInactive });
  res.json({ success: true, categories });
}

async function getCategory(req, res) {
  const category = await categoryService.getCategoryById(req.params.id);
  res.json({ success: true, category });
}

async function createCategory(req, res) {
  const category = await categoryService.createCategory(req.body);
  res.status(201).json({ success: true, category });
}

async function updateCategory(req, res) {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  res.json({ success: true, category });
}

async function deleteCategory(req, res) {
  const result = await categoryService.deleteCategory(req.params.id);
  res.json({ success: true, ...result });
}

async function listServiceAreas(req, res) {
  const serviceAreas = await categoryService.listServiceAreas();
  res.json({ success: true, serviceAreas });
}

async function suggestCategory(req, res) {
  const suggestion = await categoryService.createCategorySuggestion(
    req.user.userId,
    req.body?.name || req.body?.suggestion
  );
  res.status(201).json({ success: true, suggestion });
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  listServiceAreas,
  suggestCategory,
};

