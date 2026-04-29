const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");

const PLATFORM_COMMISSION_RATE = 0.07;
const SUPPLIER_SHARE_RATE = 0.93;

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Normalized supplier catalog category: trim + lowercase; default "general". */
function normalizeInventoryCategoryKey(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s.length ? s : "general";
}

async function ensureInventoryCategory(tx, supplierId, rawOrNormalized) {
  const name = normalizeInventoryCategoryKey(rawOrNormalized);
  const id = randomUUID();
  const prismaLike = tx && typeof tx.$executeRaw === "function" ? tx : prisma;
  await prismaLike.$executeRaw`
    INSERT INTO "SupplierInventoryCategory" ("id", "supplierId", "name", "createdAt")
    VALUES (${id}, ${String(supplierId)}, ${name}, NOW())
    ON CONFLICT ("supplierId", "name") DO NOTHING
  `;
  return name;
}

/**
 * Persist lowercase category on products and sync SupplierInventoryCategory rows
 * so "Tiles" / "tiles" collapse to one canonical name.
 */
async function reconcileSupplierInventoryCategories(userId) {
  const row = await findSupplierRecordByUserId(userId);
  if (!row) return;
  const products = Array.isArray(row.products) ? [...row.products] : [];
  let dirty = false;
  const normalized = products.map((p) => {
    if (!p || typeof p !== "object") return p;
    const n = normalizeInventoryCategoryKey(p.category);
    if (String(p.category || "") !== n) dirty = true;
    return { ...p, category: n };
  });
  const distinct = [
    ...new Set(
      normalized
        .filter((p) => p && typeof p === "object")
        .map((p) => normalizeInventoryCategoryKey(p.category))
    ),
  ];

  await prisma.$transaction(async (tx) => {
    if (dirty) {
      await tx.supplier.update({
        where: { id: row.id },
        data: { products: normalized },
      });
    }
    for (const name of distinct) {
      await ensureInventoryCategory(tx, row.id, name);
    }
  });
}

function splitMaterialsCommission(materialsSubtotal) {
  const gross = Math.max(0, Number(materialsSubtotal) || 0);
  const platformCommission = roundMoney(gross * PLATFORM_COMMISSION_RATE);
  const supplierEarning = roundMoney(gross * SUPPLIER_SHARE_RATE);
  return {
    materialsSubtotal: gross,
    platformCommission,
    supplierEarning,
  };
}

function normalizeProduct(product) {
  if (!product || typeof product !== "object") throw new AppError("Invalid product", 400);
  const id = String(product.id || randomUUID());
  const name = String(product.name || "").trim();
  if (!name) throw new AppError("Product name is required", 400);
  const qtyRaw = product.quantity !== undefined ? Number(product.quantity) : NaN;
  let quantity =
    Number.isFinite(qtyRaw) && qtyRaw >= 0 ? Math.floor(qtyRaw) : product.inStock === false ? 0 : 999999;
  if (quantity < 0) quantity = 0;
  const desc = product.description != null ? String(product.description).trim() : "";
  return {
    id,
    name,
    category: normalizeInventoryCategoryKey(product.category),
    price: Number(product.price || 0),
    qualityTier: ["low", "medium", "high"].includes(product.qualityTier) ? product.qualityTier : "medium",
    unit: String(product.unit || "unit"),
    inStock: product.inStock !== false && quantity > 0,
    quantity,
    description: desc || undefined,
    special: Boolean(product.special),
    specialEndDate: product.specialEndDate || undefined,
    image: product.image || undefined,
  };
}

function normalizeSupplierSeed(input) {
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

function rowToPublicApi(row, { omitInternal = false } = {}) {
  const products = Array.isArray(row.products) ? row.products : [];
  const base = {
    id: row.id,
    name: row.name,
    logo: row.logo || undefined,
    hasDelivery: row.hasDelivery,
    deliveryFee: Number(row.deliveryFee),
    products,
    businessName: row.businessName || undefined,
    address: row.address || undefined,
    phone: row.phone || undefined,
  };
  if (!omitInternal) {
    base.createdAt =
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ? String(row.createdAt) : undefined;
    base.createdByAdmin = Boolean(row.createdByAdmin);
    base.userId = row.userId || undefined;
  }
  return base;
}

async function findSupplierRecordByUserId(userId) {
  return prisma.supplier.findFirst({
    where: { userId: String(userId) },
  });
}

async function getSupplierProfileByUserId(userId) {
  await reconcileSupplierInventoryCategories(userId);
  const row = await findSupplierRecordByUserId(userId);
  if (!row) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
  });
  const pub = rowToPublicApi(row, { omitInternal: false });
  return {
    ...pub,
    accountEmail: user?.email ?? null,
    displayName: user?.name ?? null,
    accountPhone: user?.phone ?? null,
    role: user?.role,
  };
}

async function listSuppliersForPublicCatalog() {
  const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  return rows.map((row) => rowToPublicApi(row, { omitInternal: true }));
}

async function getProductsByCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  const out = [];
  for (const row of rows) {
    const supplier = rowToPublicApi(row, { omitInternal: true });
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

async function getSupplierById(id) {
  const row = await prisma.supplier.findUnique({ where: { id } });
  return row ? rowToPublicApi(row, { omitInternal: true }) : null;
}

async function listSuppliersForAdminDashboard() {
  const rows = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      user: { select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true } },
    },
  });
  return rows.map((row) => ({
    ...rowToPublicApi(row, { omitInternal: false }),
    linkedUserEmail: row.user?.email ?? null,
    linkedUserName: row.user?.name ?? null,
    linkedUserId: row.user?.id ?? null,
  }));
}

async function provisionSupplierByAdmin(body) {
  const email = String(body?.email || "")
    .toLowerCase()
    .trim();
  const password = body?.password;
  const displayName = String(body?.name || "").trim();
  const businessName = String(body?.businessName || "").trim();
  const name = displayName || businessName;
  const phone = body?.phone != null && String(body.phone).trim() ? String(body.phone).trim() : null;
  const address = body?.address != null && String(body.address).trim() ? String(body.address).trim() : null;

  if (!email) throw new AppError("Email is required", 400);
  if (!password || String(password).length < 8) throw new AppError("Password must be at least 8 characters", 400);
  if (!businessName && !displayName) throw new AppError("Name or business name is required", 400);

  const hashed = await bcrypt.hash(String(password), 12);
  const supplierId = randomUUID();

  try {
    await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            password: hashed,
            name: name || businessName,
            phone,
            role: "SUPPLIER",
          },
        });
        await tx.supplier.create({
          data: {
            id: supplierId,
            userId: user.id,
            name: businessName || name || "Supplier",
            businessName: businessName || null,
            address,
            phone: phone ?? null,
            hasDelivery: true,
            deliveryFee: new Prisma.Decimal(0),
            products: [],
            createdByAdmin: true,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 8000,
        timeout: 20000,
      }
    );
  } catch (err) {
    if (err.code === "P2002") {
      throw new AppError("Email already registered", 409);
    }
    throw err;
  }

  return getSupplierDetailsForAdmin(supplierId);
}

async function getSupplierDetailsForAdmin(id) {
  const row = await prisma.supplier.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true } },
    },
  });
  if (!row) return null;
  return {
    ...rowToPublicApi(row, { omitInternal: false }),
    linkedUserEmail: row.user?.email ?? null,
    linkedUserName: row.user?.name ?? null,
    linkedUserId: row.user?.id ?? null,
  };
}

/**
 * Resolve supplier-owned row for authenticated supplier portal.
 */
async function requireSupplierOwnedByUserId(userId) {
  const row = await findSupplierRecordByUserId(userId);
  if (!row) throw new AppError("Supplier profile not found", 404);
  return row;
}

async function upsertSupplierProduct(userId, product) {
  await prisma.$transaction(
    async (tx) => {
      const row = await tx.supplier.findFirst({ where: { userId } });
      if (!row) throw new AppError("Supplier not found", 404);
      const catName = normalizeInventoryCategoryKey(product.category);
      await ensureInventoryCategory(tx, row.id, catName);
      const created = normalizeProduct({ ...product, category: catName });
      const products = Array.isArray(row.products) ? [...row.products] : [];
      const idx = products.findIndex((p) => p && String(p.id) === String(created.id));
      if (idx >= 0) products[idx] = { ...products[idx], ...created };
      else products.push(created);
      await tx.supplier.update({
        where: { id: row.id },
        data: { products },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  );
  const rowAfter = await findSupplierRecordByUserId(userId);
  return rowToPublicApi(rowAfter, { omitInternal: false });
}

async function updateSupplierProduct(userId, productId, patch) {
  await prisma.$transaction(
    async (tx) => {
      const row = await tx.supplier.findFirst({ where: { userId } });
      if (!row) throw new AppError("Supplier not found", 404);
      const products = Array.isArray(row.products) ? [...row.products] : [];
      const idx = products.findIndex((p) => p && String(p.id) === String(productId));
      if (idx < 0) throw new AppError("Product not found", 404);
      const merged = normalizeProduct({
        ...products[idx],
        ...patch,
        id: productId,
      });
      await ensureInventoryCategory(tx, row.id, merged.category);
      products[idx] = merged;
      await tx.supplier.update({
        where: { id: row.id },
        data: { products },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  );
  const rowAfter = await findSupplierRecordByUserId(userId);
  return rowToPublicApi(rowAfter, { omitInternal: false });
}

async function deleteSupplierProduct(userId, productId) {
  await prisma.$transaction(
    async (tx) => {
      const row = await tx.supplier.findFirst({ where: { userId } });
      if (!row) throw new AppError("Supplier not found", 404);
      const products = (Array.isArray(row.products) ? row.products : []).filter(
        (p) => p && String(p.id) !== String(productId)
      );
      await tx.supplier.update({
        where: { id: row.id },
        data: { products },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  );
  const rowAfter = await findSupplierRecordByUserId(userId);
  return rowToPublicApi(rowAfter, { omitInternal: false });
}

async function updateSupplierBusinessProfile(userId, body = {}) {
  const row = await requireSupplierOwnedByUserId(userId);
  const businessName = body.businessName !== undefined ? String(body.businessName).trim() || null : row.businessName;
  const address = body.address !== undefined ? String(body.address).trim() || null : row.address;
  const businessPhone =
    body.phone !== undefined ? (body.phone != null ? String(body.phone).trim() : null) : row.phone;

  let logoPayload = {};
  if (body.logo !== undefined) {
    if (body.logo === null || body.logo === "") {
      logoPayload.logo = null;
    } else {
      logoPayload.logo = String(body.logo).trim();
    }
  }

  await prisma.supplier.update({
    where: { id: row.id },
    data: {
      businessName: businessName ?? row.businessName,
      address,
      phone: businessPhone,
      name:
        typeof body.storeDisplayName === "string" && body.storeDisplayName.trim()
          ? body.storeDisplayName.trim()
          : row.name,
      ...(Object.keys(logoPayload).length ? logoPayload : {}),
    },
  });

  const accountEmailRaw = body.accountEmail !== undefined ? body.accountEmail : body.email;

  const userData = {};

  if (accountEmailRaw !== undefined) {
    const newEmail = String(accountEmailRaw).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      throw new AppError("Invalid email address", 400);
    }
    const taken = await prisma.user.findFirst({
      where: { email: newEmail, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) {
      throw new AppError("Email already in use", 409);
    }
    userData.email = newEmail;
  }
  if (body.contactName !== undefined) {
    userData.name = String(body.contactName).trim();
  }
  if (body.accountPhone !== undefined) {
    userData.phone = body.accountPhone === "" ? null : String(body.accountPhone).trim();
  }

  if (Object.keys(userData).length > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: userData,
    });
  }

  return getSupplierProfileByUserId(userId);
}

async function listInventoryCategoriesForUser(userId) {
  await reconcileSupplierInventoryCategories(userId);
  const row = await requireSupplierOwnedByUserId(userId);
  const rows = await prisma.$queryRaw`
    SELECT "id", "name"
    FROM "SupplierInventoryCategory"
    WHERE "supplierId" = ${row.id}
    ORDER BY "name" ASC
  `;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));
}

async function createInventoryCategory(userId, rawName) {
  const trimmed = String(rawName ?? "").trim();
  if (!trimmed) {
    throw new AppError("Category name is required", 400);
  }
  const row = await requireSupplierOwnedByUserId(userId);
  const name = normalizeInventoryCategoryKey(trimmed);
  const existing = await prisma.$queryRaw`
    SELECT id
    FROM "SupplierInventoryCategory"
    WHERE "supplierId" = ${row.id}
      AND "name" = ${name}
    LIMIT 1
  `;
  if (Array.isArray(existing) && existing.length > 0) {
    throw new AppError("A category with this name already exists", 409);
  }
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "SupplierInventoryCategory" ("id", "supplierId", "name", "createdAt")
    VALUES (${id}, ${row.id}, ${name}, NOW())
  `;
  return { id, name };
}

module.exports = {
  PLATFORM_COMMISSION_RATE,
  SUPPLIER_SHARE_RATE,
  splitMaterialsCommission,
  normalizeProduct,
  normalizeSupplierSeed,
  rowToPublicApi,
  listSuppliersForPublicCatalog,
  getProductsByCategory,
  getSupplierById,
  getSupplierDetailsForAdmin,
  listSuppliersForAdminDashboard,
  provisionSupplierByAdmin,
  getSupplierProfileByUserId,
  requireSupplierOwnedByUserId,
  upsertSupplierProduct,
  updateSupplierProduct,
  deleteSupplierProduct,
  updateSupplierBusinessProfile,
  findSupplierRecordByUserId,
  normalizeInventoryCategoryKey,
  listInventoryCategoriesForUser,
  createInventoryCategory,
};
