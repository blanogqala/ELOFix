const marketplaceCategoryService = require("../services/marketplaceMaterialCategory.service");

async function listActive(req, res) {
  const categories = await marketplaceCategoryService.listActivePublic();
  res.json({ success: true, categories });
}

module.exports = {
  listActive,
};
