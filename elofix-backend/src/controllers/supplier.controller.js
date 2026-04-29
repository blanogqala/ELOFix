const supplierService = require("../services/supplier.service");

async function listSuppliers(req, res) {
  const suppliers = await supplierService.listSuppliersForPublicCatalog();
  res.json({ success: true, suppliers });
}

async function getSupplier(req, res) {
  const supplier = await supplierService.getSupplierById(req.params.id);
  res.json({ success: true, supplier });
}

async function createSupplier(req, res) {
  const supplier = await supplierService.provisionSupplierByAdmin(req.body || {});
  res.status(201).json({ success: true, supplier });
}

async function getProductsByCategory(req, res) {
  const products = await supplierService.getProductsByCategory(req.query.category);
  res.json({ success: true, products });
}

module.exports = {
  listSuppliers,
  getSupplier,
  createSupplier,
  getProductsByCategory,
};
