const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");
const { readState, updateState } = require("./jsonStore.service");

function normalizeProduct(product) {
  if (!product || typeof product !== "object") throw new AppError("Invalid product", 400);
  const id = String(product.id || randomUUID());
  const name = String(product.name || "").trim();
  if (!name) throw new AppError("Product name is required", 400);
  return {
    id,
    name,
    category: String(product.category || "").trim() || "general",
    price: Number(product.price || 0),
    qualityTier: ["low", "medium", "high"].includes(product.qualityTier) ? product.qualityTier : "medium",
    unit: String(product.unit || "unit"),
    inStock: product.inStock !== false,
    special: Boolean(product.special),
    specialEndDate: product.specialEndDate || undefined,
    image: product.image || undefined,
  };
}

function normalizeSupplier(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new AppError("Supplier name is required", 400);
  return {
    id: String(input.id || randomUUID()),
    name,
    logo: input.logo || undefined,
    hasDelivery: input.hasDelivery !== false,
    deliveryFee: Number(input.deliveryFee || 0),
    products: Array.isArray(input.products) ? input.products.map(normalizeProduct) : [],
  };
}

async function listSuppliers() {
  const state = await readState();
  return state.suppliers || [];
}

async function getSupplierById(id) {
  const suppliers = await listSuppliers();
  return suppliers.find((s) => s.id === id) || null;
}

async function createSupplier(name) {
  const supplier = normalizeSupplier({ name, products: [] });
  await updateState((state) => {
    state.suppliers = [...(state.suppliers || []), supplier];
    return state;
  });
  return supplier;
}

async function addProduct(supplierId, product) {
  let created = null;
  await updateState((state) => {
    const suppliers = state.suppliers || [];
    const idx = suppliers.findIndex((s) => s.id === supplierId);
    if (idx < 0) throw new AppError("Supplier not found", 404);
    created = normalizeProduct(product);
    suppliers[idx] = {
      ...suppliers[idx],
      products: [...(suppliers[idx].products || []), created],
    };
    state.suppliers = suppliers;
    return state;
  });
  return getSupplierById(supplierId);
}

async function updateProductPrice(supplierId, productId, newPrice) {
  const numericPrice = Number(newPrice);
  if (Number.isNaN(numericPrice) || numericPrice < 0) {
    throw new AppError("newPrice must be a non-negative number", 400);
  }
  await updateState((state) => {
    const suppliers = state.suppliers || [];
    const idx = suppliers.findIndex((s) => s.id === supplierId);
    if (idx < 0) throw new AppError("Supplier not found", 404);
    const products = suppliers[idx].products || [];
    const pIdx = products.findIndex((p) => p.id === productId);
    if (pIdx < 0) throw new AppError("Product not found", 404);
    products[pIdx] = { ...products[pIdx], price: numericPrice };
    suppliers[idx] = { ...suppliers[idx], products };
    state.suppliers = suppliers;
    return state;
  });
  return getSupplierById(supplierId);
}

async function getProductsByCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  const suppliers = await listSuppliers();
  const out = [];
  for (const supplier of suppliers) {
    for (const product of supplier.products || []) {
      if (!normalized || String(product.category || "").trim().toLowerCase() === normalized) {
        out.push({
          ...product,
          supplierId: supplier.id,
          supplierName: supplier.name,
        });
      }
    }
  }
  return out;
}

module.exports = {
  listSuppliers,
  getSupplierById,
  createSupplier,
  addProduct,
  updateProductPrice,
  getProductsByCategory,
};
