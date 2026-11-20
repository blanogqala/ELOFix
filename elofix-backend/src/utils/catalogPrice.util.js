const AppError = require("./AppError");

/** Same 2-cent tolerance as payment amount checks. */
const CATALOG_PRICE_TOLERANCE_CENTS = 2;

function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function catalogPricesMatch(actual, expected) {
  const a = toCents(actual);
  const e = toCents(expected);
  if (a == null || e == null) return false;
  return Math.abs(a - e) <= CATALOG_PRICE_TOLERANCE_CENTS;
}

function roundCatalogMoney(value) {
  const cents = toCents(value);
  if (cents == null) return 0;
  return cents / 100;
}

function catalogPriceForProduct(products, productId) {
  const id = String(productId || "").trim();
  if (!id) return null;
  const list = Array.isArray(products) ? products : [];
  const product = list.find((row) => row && String(row.id) === id);
  if (!product) return null;
  const price = Number(product.price);
  if (!Number.isFinite(price) || price < 0) return null;
  return roundCatalogMoney(price);
}

/**
 * Reject a checkout line whose unit price is not the branch catalog price.
 * @returns {{ catalogPrice: number, qty: number, lineTotal: number }}
 */
function assertLineMatchesCatalog(products, line) {
  if (!line || typeof line !== "object") {
    throw new AppError("Each material line is required", 400);
  }
  const productId = String(line.productId || "").trim();
  const catalogPrice = catalogPriceForProduct(products, productId);
  if (catalogPrice == null) {
    throw new AppError("A selected product is not sold by this store", 400);
  }
  const sent = Number(line.unitPrice != null ? line.unitPrice : line.price);
  if (!catalogPricesMatch(sent, catalogPrice)) {
    throw new AppError("Item price does not match the store catalog", 400);
  }
  const qty = Number(line.qty != null ? line.qty : line.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new AppError("Item quantity must be greater than zero", 400);
  }
  return {
    catalogPrice,
    qty,
    lineTotal: roundCatalogMoney(qty * catalogPrice),
  };
}

/**
 * Every line must match the catalog. When materialsTotal is set, it must match
 * the catalog sum (client totals are not authoritative).
 * @returns {number} catalog materials total
 */
function assertLinesMatchProductList(products, lines, options = {}) {
  const list = Array.isArray(lines) ? lines : [];
  if (list.length === 0) {
    throw new AppError("At least one material is required", 400);
  }
  let sum = 0;
  for (const line of list) {
    sum += assertLineMatchesCatalog(products, line).lineTotal;
  }
  const total = roundCatalogMoney(sum);
  if (options.materialsTotal != null && options.materialsTotal !== "") {
    if (!catalogPricesMatch(options.materialsTotal, total)) {
      throw new AppError("Order total does not match the store catalog", 400);
    }
  }
  return total;
}

function lineBranchId(line) {
  return String(line?.branchId || line?.storeId || line?.supplierId || "").trim();
}

/**
 * Load each line's branch catalog and reject prices the storefront would not show.
 * Quotes are checked when they are saved, so a later catalog edit does not void them.
 */
async function assertMaterialLinesMatchCatalog(lines) {
  const list = Array.isArray(lines) ? lines : [];
  if (list.length === 0) {
    throw new AppError("At least one material is required", 400);
  }
  const groups = new Map();
  for (const line of list) {
    const branchId = lineBranchId(line);
    if (!branchId) {
      throw new AppError("Each material must belong to a store branch", 400);
    }
    if (!groups.has(branchId)) groups.set(branchId, []);
    groups.get(branchId).push(line);
  }

  const prisma = require("../config/prisma");
  const branchService = require("../services/branch.service");
  const branches = await prisma.branch.findMany({
    where: { id: { in: [...groups.keys()] }, isActive: true },
    include: branchService.INVENTORY_CATEGORIES_INCLUDE,
  });
  const byId = new Map(branches.map((branch) => [String(branch.id), branch]));

  for (const [branchId, group] of groups) {
    const branch = byId.get(branchId);
    if (!branch) {
      throw new AppError("A selected store is not available", 400);
    }
    const products = branchService.productsForApi(branch, { omitInternal: true });
    assertLinesMatchProductList(products, group);
  }
}

module.exports = {
  CATALOG_PRICE_TOLERANCE_CENTS,
  catalogPricesMatch,
  roundCatalogMoney,
  catalogPriceForProduct,
  assertLineMatchesCatalog,
  assertLinesMatchProductList,
  assertMaterialLinesMatchCatalog,
};
