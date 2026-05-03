const AppError = require("../utils/AppError");
const { registerUploadedFile } = require("../services/fileStorage.service");
const supplierService = require("../services/supplier.service");
const materialOrderService = require("../services/materialOrder.service");

async function postInventoryCategory(req, res) {
  const category = await supplierService.createInventoryCategory(req.user.userId, req.body?.name);
  return res.status(201).json({ success: true, category });
}

async function getInventoryCategories(req, res) {
  const categories = await supplierService.listInventoryCategoriesForUser(req.user.userId);
  res.json({ success: true, categories });
}

async function getMe(req, res) {
  const profile = await supplierService.getSupplierProfileByUserId(req.user.userId);
  if (!profile) {
    return res.status(404).json({ success: false, message: "Supplier profile missing" });
  }
  res.json({ success: true, profile });
}

async function getOrders(req, res) {
  const row = await supplierService.requireSupplierOwnedByUserId(req.user.userId);
  const status = req.query.status || undefined;
  const orders = await materialOrderService.listMaterialOrdersBySupplier(row.id, {
    fulfillmentStatus: status,
  });
  try {
    console.log(
      JSON.stringify({
        ns: "supplier_portal",
        event: "get_orders_response",
        supplierId: row.id,
        count: orders.length,
        statusFilter: status ?? null,
        at: new Date().toISOString(),
      })
    );
  } catch (_) {
    /* ignore */
  }
  res.json({ success: true, orders });
}

async function patchFulfillment(req, res) {
  const row = await supplierService.requireSupplierOwnedByUserId(req.user.userId);
  const nextStatus = req.body?.status;
  const order = await materialOrderService.updateMaterialOrderFulfillment(req.params.orderId, row.id, nextStatus);
  res.json({ success: true, order });
}

async function postEnsureTracking(req, res) {
  const row = await supplierService.requireSupplierOwnedByUserId(req.user.userId);
  const session = await materialOrderService.ensureStoreDeliveryTrackingSession(req.params.orderId, row.id);
  res.json({ success: true, ...session });
}

async function postOrderNote(req, res) {
  const order = await materialOrderService.appendSupplierOrderNote(
    req.params.orderId,
    req.user.userId,
    req.body?.message
  );
  res.json({ success: true, order });
}

async function postProduct(req, res) {
  const supplier = await supplierService.upsertSupplierProduct(req.user.userId, req.body || {});
  return res.status(201).json({ success: true, supplier });
}

async function patchProduct(req, res) {
  const supplier = await supplierService.updateSupplierProduct(req.user.userId, req.params.productId, req.body || {});
  res.json({ success: true, supplier });
}

async function deleteProduct(req, res) {
  const supplier = await supplierService.deleteSupplierProduct(req.user.userId, req.params.productId);
  res.json({ success: true, supplier });
}

async function patchProfile(req, res) {
  const profile = await supplierService.updateSupplierBusinessProfile(req.user.userId, req.body || {});
  res.json({ success: true, profile });
}

async function uploadProductImage(req, res) {
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  const stored = await registerUploadedFile(req.file, {
    ownerUserId: req.user.userId,
    type: "supplier_product",
  });
  res.json({ success: true, fileId: stored.fileId, url: stored.url });
}

async function uploadLogo(req, res) {
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  const stored = await registerUploadedFile(req.file, {
    ownerUserId: req.user.userId,
    type: "supplier_logo",
  });
  const profile = await supplierService.updateSupplierBusinessProfile(req.user.userId, { logo: stored.url });
  res.json({ success: true, fileId: stored.fileId, url: stored.url, profile });
}

module.exports = {
  getMe,
  getInventoryCategories,
  postInventoryCategory,
  getOrders,
  patchFulfillment,
  postEnsureTracking,
  postOrderNote,
  postProduct,
  patchProduct,
  deleteProduct,
  patchProfile,
  uploadProductImage,
  uploadLogo,
};
