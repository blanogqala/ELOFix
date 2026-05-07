const supplierService = require("../services/supplier.service");

async function listStores(req, res) {
  const stores = await supplierService.listStoresForLocation(req.query || {});
  res.json({ success: true, stores });
}

async function getStoreProducts(req, res) {
  const products = await supplierService.getStoreProductListById(req.params.id);
  res.json({ success: true, products });
}

module.exports = {
  listStores,
  getStoreProducts,
};
