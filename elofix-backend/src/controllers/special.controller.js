const specialService = require("../services/special.service");

async function getSpecials(req, res) {
  const specials = await specialService.listSpecials({
    supplierId: req.query.supplierId,
    category: req.query.category,
  });
  res.json({ success: true, specials });
}

async function getDeliveryProviders(req, res) {
  await specialService.seedDefaultsIfEmpty();
  const deliveryProviders = await specialService.listDeliveryProviders();
  res.json({ success: true, deliveryProviders });
}

async function createDeliveryProvider(req, res) {
  const provider = await specialService.createDeliveryProvider(req.body || {});
  res.status(201).json({ success: true, provider });
}

module.exports = {
  getSpecials,
  getDeliveryProviders,
  createDeliveryProvider,
};
