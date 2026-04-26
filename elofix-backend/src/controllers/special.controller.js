const specialService = require("../services/special.service");

async function getSpecials(req, res) {
  const specials = await specialService.listSpecials({
    supplierId: req.query.supplierId,
    category: req.query.category,
  });
  res.json({ success: true, specials });
}

module.exports = {
  getSpecials,
};
