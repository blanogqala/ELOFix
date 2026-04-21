const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");

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

function rowToApi(row) {
  const products = Array.isArray(row.products) ? row.products : [];
  return {
    id: row.id,
    name: row.name,
    logo: row.logo || undefined,
    hasDelivery: row.hasDelivery,
    deliveryFee: Number(row.deliveryFee),
    products,
  };
}

async function listSuppliers() {
  const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  return rows.map(rowToApi);
}

async function getSupplierById(id) {
  const row = await prisma.supplier.findUnique({ where: { id } });
  return row ? rowToApi(row) : null;
}

async function createSupplier(name) {
  const supplier = normalizeSupplier({ name, products: [] });
  await prisma.supplier.create({
    data: {
      id: supplier.id,
      name: supplier.name,
      logo: supplier.logo || null,
      hasDelivery: supplier.hasDelivery,
      deliveryFee: supplier.deliveryFee,
      products: supplier.products,
    },
  });
  return getSupplierById(supplier.id);
}

async function addProduct(supplierId, product) {
  await prisma.$transaction(
    async (tx) => {
      const row = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!row) throw new AppError("Supplier not found", 404);
      const created = normalizeProduct(product);
      const products = Array.isArray(row.products) ? [...row.products, created] : [created];
      await tx.supplier.update({
        where: { id: supplierId },
        data: { products },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }
  );
  return getSupplierById(supplierId);
}

async function updateProductPrice(supplierId, productId, newPrice) {
  const numericPrice = Number(newPrice);
  if (Number.isNaN(numericPrice) || numericPrice < 0) {
    throw new AppError("newPrice must be a non-negative number", 400);
  }
  await prisma.$transaction(
    async (tx) => {
      const row = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!row) throw new AppError("Supplier not found", 404);
      const products = Array.isArray(row.products) ? [...row.products] : [];
      const pIdx = products.findIndex((p) => p && String(p.id) === String(productId));
      if (pIdx < 0) throw new AppError("Product not found", 404);
      products[pIdx] = { ...products[pIdx], price: numericPrice };
      await tx.supplier.update({
        where: { id: supplierId },
        data: { products },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }
  );
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
