const supplierService = require("../services/supplier.service");

async function listSuppliers(req, res) {
  const suppliers = await supplierService.listSuppliers();
  res.json({ success: true, suppliers });
}

async function getSupplier(req, res) {
  const supplier = await supplierService.getSupplierById(req.params.id);
  res.json({ success: true, supplier });
}

async function createSupplier(req, res) {
  const supplier = await supplierService.createSupplier(req.body?.name);
  res.status(201).json({ success: true, supplier });
}

async function addProduct(req, res) {
  const supplier = await supplierService.addProduct(req.params.id, req.body || {});
  res.json({ success: true, supplier });
}

async function updateProductPrice(req, res) {
  const supplier = await supplierService.updateProductPrice(
    req.params.id,
    req.params.productId,
    req.body?.newPrice
  );
  res.json({ success: true, supplier });
}

async function getProductsByCategory(req, res) {
  const products = await supplierService.getProductsByCategory(req.query.category);
  res.json({ success: true, products });
}

module.exports = {
  listSuppliers,
  getSupplier,
  createSupplier,
  addProduct,
  updateProductPrice,
  getProductsByCategory,
};
