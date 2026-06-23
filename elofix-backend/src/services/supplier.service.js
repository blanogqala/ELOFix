const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const branchService = require("./branch.service");

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

async function ensureInventoryCategory(tx, branchId, rawOrNormalized) {
  const name = normalizeInventoryCategoryKey(rawOrNormalized);
  const id = randomUUID();
  const prismaLike = tx && typeof tx.$executeRaw === "function" ? tx : prisma;
  await prismaLike.$executeRaw`
    INSERT INTO "BranchInventoryCategory" ("id", "branchId", "name", "createdAt")
    VALUES (${id}, ${String(branchId)}, ${name}, NOW())
    ON CONFLICT ("branchId", "name") DO NOTHING
  `;
  return name;
}

/**
 * Persist lowercase category on branch products and sync BranchInventoryCategory rows.
 */
async function reconcileBranchInventoryCategories(userId, branchId) {
  const sup = await findSupplierRecordByUserId(userId);
  if (!sup) return;
  const branch = await prisma.branch.findFirst({
    where: { id: String(branchId), supplierId: sup.id },
  });
  if (!branch) return;
  const products = Array.isArray(branch.products) ? [...branch.products] : [];
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
      await tx.branch.update({
        where: { id: branch.id },
        data: { products: normalized },
      });
    }
    for (const name of distinct) {
      await ensureInventoryCategory(tx, branch.id, name);
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

/** 7% platform commission on materials + store delivery fee combined. */
function splitStoreDeliveryCommission(materialsSubtotal, deliveryFee) {
  const materials = Math.max(0, Number(materialsSubtotal) || 0);
  const delivery = Math.max(0, Number(deliveryFee) || 0);
  const gross = roundMoney(materials + delivery);
  const platformCommission = roundMoney(gross * PLATFORM_COMMISSION_RATE);
  const supplierEarning = roundMoney(gross - platformCommission);
  return {
    materialsSubtotal: materials,
    deliveryFee: delivery,
    orderGross: gross,
    platformCommission,
    supplierEarning,
  };
}

function normalizeDeliveryTypeKey(raw) {
  const u = String(raw || "").toUpperCase();
  if (u === "SELF" || u === "SELF_COLLECT") return "SELF";
  if (u === "STORE" || u === "STORE_DELIVERY") return "STORE_DELIVERY";
  if (u === "PROVIDER" || u === "DELIVERY_PROVIDER") return "DELIVERY_PROVIDER";
  return u;
}

function storeDeliveryFeeCountsForCommission(order = {}) {
  const deliveryType = normalizeDeliveryTypeKey(order.deliveryType ?? order.delivery?.type);
  if (deliveryType !== "STORE_DELIVERY") return false;
  const deliveryFee = Math.max(0, Number(order.deliveryFee ?? order.delivery?.fee ?? 0) || 0);
  if (deliveryFee <= 0) return false;
  const deliveryPaid = Boolean(order.payment?.deliveryPaid);
  if (deliveryPaid) return true;
  const status = String(order.delivery?.status || "").trim();
  return ["Approved", "Processing", "InProgress", "OnTheWay", "Delivered"].includes(status);
}

/**
 * Unified finance breakdown for material orders (API + supplier portal).
 * Store delivery: 7% on materials + delivery only after branch sets an approved fee.
 */
function buildOrderFinanceBreakdown(order = {}) {
  const materialsSubtotal = Math.max(
    0,
    Number(order.materialsSubtotal ?? order.subtotal ?? 0) || 0
  );
  const deliveryFee = Math.max(0, Number(order.deliveryFee ?? order.delivery?.fee ?? 0) || 0);
  const deliveryType = normalizeDeliveryTypeKey(order.deliveryType ?? order.delivery?.type);
  const deliveryPaid = Boolean(order.payment?.deliveryPaid);
  const materialsPaid =
    Boolean(order.payment?.materialsPaid) || String(order.paymentStatus || order.dbPaymentStatus || "").toLowerCase() === "paid";

  const useCombinedCommission = storeDeliveryFeeCountsForCommission(order);
  const commissionBasis = useCombinedCommission ? "materials_plus_delivery" : "materials_only";
  const orderGross = useCombinedCommission
    ? roundMoney(materialsSubtotal + deliveryFee)
    : roundMoney(materialsSubtotal);

  let platformCommission;
  let supplierNet;

  if (
    commissionBasis === "materials_plus_delivery" &&
    deliveryPaid &&
    order.platformCommission != null &&
    Number.isFinite(Number(order.platformCommission))
  ) {
    platformCommission = roundMoney(Number(order.platformCommission));
    supplierNet =
      order.supplierEarning != null && Number.isFinite(Number(order.supplierEarning))
        ? roundMoney(Number(order.supplierEarning))
        : roundMoney(orderGross - platformCommission);
  } else if (commissionBasis === "materials_plus_delivery") {
    const split = splitStoreDeliveryCommission(materialsSubtotal, deliveryFee);
    platformCommission = split.platformCommission;
    supplierNet = split.supplierEarning;
  } else {
    const split = splitMaterialsCommission(materialsSubtotal);
    platformCommission = split.platformCommission;
    supplierNet = split.supplierEarning;
  }

  return {
    materialsSubtotal,
    deliveryFee,
    orderGross,
    platformCommission,
    supplierNet,
    commissionBasis,
    deliveryPaid,
    materialsPaid,
    deliveryType,
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

function storeDisplayName(row) {
  const brand = String(row.brandName || "").trim();
  const branch = String(row.branchName || "").trim();
  const legal = String(row.name || "").trim();
  if (brand && branch) return `${brand} - ${branch}`;
  if (branch && legal) return `${legal} - ${branch}`;
  return legal || brand || branch || "Store";
}

function rowToPublicApi(row, { omitInternal = false } = {}) {
  const products = [];
  const lat = row.latitude;
  const lng = row.longitude;
  const latNum =
    lat !== undefined && lat !== null && String(lat) !== ""
      ? Number(lat)
      : undefined;
  const lngNum =
    lng !== undefined && lng !== null && String(lng) !== ""
      ? Number(lng)
      : undefined;
  const brandName = row.brandName != null && String(row.brandName).trim() ? String(row.brandName).trim() : undefined;
  const branchName = row.branchName != null && String(row.branchName).trim() ? String(row.branchName).trim() : undefined;
  const cityField = row.city != null && String(row.city).trim() ? String(row.city).trim() : undefined;
  const base = {
    id: row.id,
    name: row.name,
    displayName: storeDisplayName(row),
    brandName,
    branchName,
    city: cityField,
    logo: row.logo || undefined,
    hasDelivery: row.hasDelivery,
    deliveryFee: (() => {
      const n = Number(row.deliveryFee ?? 0);
      return Number.isFinite(n) ? n : 0;
    })(),
    products,
    businessName: row.businessName || undefined,
    address: row.address || undefined,
    phone: row.phone || undefined,
    latitude: Number.isFinite(latNum) ? latNum : undefined,
    longitude: Number.isFinite(lngNum) ? lngNum : undefined,
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
  const row = await findSupplierRecordByUserId(userId);
  if (!row) return null;
  const branches = await prisma.branch.findMany({
    where: { supplierId: row.id },
    orderBy: { createdAt: "asc" },
  });
  for (const b of branches) {
    await reconcileBranchInventoryCategories(userId, b.id);
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
  });
  const pub = rowToPublicApi(row, { omitInternal: false });
  pub.branches = branches.map((b) => branchService.branchToPublicApi(b, row, { omitInternal: false }));
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
  const allBranches = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  const bySup = new Map();
  for (const b of allBranches) {
    if (!bySup.has(b.supplierId)) bySup.set(b.supplierId, []);
    bySup.get(b.supplierId).push(b);
  }
  return rows.map((row) => ({
    ...rowToPublicApi(row, { omitInternal: true }),
    branches: (bySup.get(row.id) || []).map((b) => branchService.branchToPublicApi(b, row, { omitInternal: true })),
  }));
}

/**
 * Public store list — each row is a **branch** (`id` = branchId). Delegates to branch locations.
 */
async function listStoresForLocation(query = {}) {
  return branchService.listBranchesForLocation(query);
}

async function getStoreProductListById(branchId) {
  return branchService.getBranchProductsById(branchId);
}

async function getProductsByCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    include: { supplier: true },
    orderBy: [{ supplierId: "asc" }, { name: "asc" }],
  });
  const out = [];
  for (const b of branches) {
    const supplierRow = b.supplier;
    const api = branchService.branchToPublicApi(b, supplierRow, { omitInternal: true });
    for (const product of api.products || []) {
      if (!normalized || String(product.category || "").trim().toLowerCase() === normalized) {
        out.push({
          ...product,
          branchId: b.id,
          supplierId: supplierRow.id,
          supplierName: supplierRow.name,
          branchLatitude: typeof api.latitude === "number" ? api.latitude : undefined,
          branchLongitude: typeof api.longitude === "number" ? api.longitude : undefined,
        });
      }
    }
  }
  return out;
}

async function getSupplierById(id) {
  const row = await prisma.supplier.findUnique({
    where: { id },
  });
  if (!row) return null;
  let branches = [];
  try {
    branches = await prisma.branch.findMany({
      where: { supplierId: id, isActive: true },
      orderBy: { name: "asc" },
    });
  } catch (err) {
    console.error("[getSupplierById] branch load failed", err.message);
  }
  return {
    ...rowToPublicApi(row, { omitInternal: true }),
    branches: branches.map((b) => branchService.branchToPublicApi(b, row, { omitInternal: true })),
  };
}

async function listSuppliersForAdminDashboard() {
  const rows = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      user: { select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true } },
    },
  });
  const supplierIds = rows.map((r) => r.id);
  const branchesBySupplier = new Map();
  if (supplierIds.length > 0) {
    try {
      const allBranches = await prisma.branch.findMany({
        where: { supplierId: { in: supplierIds } },
        orderBy: { createdAt: "asc" },
      });
      for (const b of allBranches) {
        if (!branchesBySupplier.has(b.supplierId)) branchesBySupplier.set(b.supplierId, []);
        branchesBySupplier.get(b.supplierId).push(b);
      }
    } catch (err) {
      console.error("[listSuppliersForAdminDashboard] branch load failed (run prisma migrations?)", err.message);
    }
  }
  return rows.map((row) => {
    const { user, ...rest } = row;
    const branches = branchesBySupplier.get(row.id) || [];
    return {
      ...rowToPublicApi(rest, { omitInternal: false }),
      branches: branches.map((b) => branchService.branchToPublicApi(b, rest, { omitInternal: false })),
      linkedUserEmail: user?.email ?? null,
      linkedUserName: user?.name ?? null,
      linkedUserId: user?.id ?? null,
    };
  });
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
        await tx.branch.create({
          data: {
            id: randomUUID(),
            supplierId,
            name: businessName || name || "Main",
            address,
            hasDelivery: true,
            deliveryFee: new Prisma.Decimal(0),
            products: [],
            isActive: true,
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
    if (err instanceof AppError) throw err;
    const hint =
      process.env.NODE_ENV !== "production"
        ? ` ${String(err.message || err)}`
        : "";
    console.error("[provisionSupplierByAdmin]", err);
    throw new AppError(`Could not create supplier account.${hint}`, 400);
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
  let branches = [];
  try {
    branches = await prisma.branch.findMany({
      where: { supplierId: id },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    console.error("[getSupplierDetailsForAdmin] branch load failed", err.message);
  }
  const { user, ...supRest } = row;
  return {
    ...rowToPublicApi(supRest, { omitInternal: false }),
    branches: branches.map((b) => branchService.branchToPublicApi(b, supRest, { omitInternal: false })),
    linkedUserEmail: user?.email ?? null,
    linkedUserName: user?.name ?? null,
    linkedUserId: user?.id ?? null,
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

async function resolveInventoryActor(reqUser) {
  if (!reqUser?.role) throw new AppError("Unauthorized", 401);
  if (reqUser.role === "SUPPLIER") {
    const row = await requireSupplierOwnedByUserId(reqUser.userId);
    return {
      role: "SUPPLIER",
      portalUserId: String(reqUser.userId),
      supplierOrgId: row.id,
      branchScopeId: null,
    };
  }
  if (reqUser.role === "BRANCH_STAFF") {
    const org = String(reqUser.supplierOrgId || "").trim();
    const bid = String(reqUser.branchId || "").trim();
    if (!org || !bid) throw new AppError("Invalid session", 401);
    return {
      role: "BRANCH_STAFF",
      portalUserId: String(reqUser.userId),
      supplierOrgId: org,
      branchScopeId: bid,
    };
  }
  throw new AppError("Forbidden", 403);
}

async function assertBranchInventoryAccess(actor, branchId) {
  const bid = String(branchId || "").trim();
  if (!bid) throw new AppError("branchId is required", 400);
  if (actor.role === "BRANCH_STAFF" && String(actor.branchScopeId) !== bid) {
    throw new AppError("Forbidden", 403);
  }
  const br = await prisma.branch.findFirst({
    where: { id: bid, supplierId: String(actor.supplierOrgId) },
  });
  if (!br) throw new AppError("Branch not found", 404);
  if (actor.role === "SUPPLIER") {
    const row = await findSupplierRecordByUserId(actor.portalUserId);
    if (!row || row.id !== br.supplierId) throw new AppError("Forbidden", 403);
  }
  return br;
}

async function inventoryProfileResponse(reqUser) {
  if (reqUser.role === "BRANCH_STAFF") {
    return getBranchStaffPortalProfile(reqUser.userId);
  }
  return getSupplierProfileByUserId(reqUser.userId);
}

async function upsertSupplierProductForPortal(reqUser, product) {
  const actor = await resolveInventoryActor(reqUser);
  const branchId = String(product?.branchId || "").trim();
  if (!branchId) throw new AppError("branchId is required", 400);
  const br = await assertBranchInventoryAccess(actor, branchId);
  await prisma.$transaction(
    async (tx) => {
      const catName = normalizeInventoryCategoryKey(product.category);
      await ensureInventoryCategory(tx, br.id, catName);
      const created = normalizeProduct({ ...product, category: catName });
      const rowBranch = await tx.branch.findUnique({ where: { id: br.id } });
      if (!rowBranch) throw new AppError("Branch not found", 404);
      const products = Array.isArray(rowBranch.products) ? [...rowBranch.products] : [];
      const idx = products.findIndex((p) => p && String(p.id) === String(created.id));
      if (idx >= 0) products[idx] = { ...products[idx], ...created };
      else products.push(created);
      await tx.branch.update({
        where: { id: br.id },
        data: { products },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  );
  return inventoryProfileResponse(reqUser);
}

async function updateSupplierProductForPortal(reqUser, productId, patch) {
  const actor = await resolveInventoryActor(reqUser);
  const branchId = String(patch?.branchId || "").trim();
  if (!branchId) throw new AppError("branchId is required", 400);
  const br = await assertBranchInventoryAccess(actor, branchId);
  await prisma.$transaction(
    async (tx) => {
      const rowBranch = await tx.branch.findUnique({ where: { id: br.id } });
      if (!rowBranch) throw new AppError("Branch not found", 404);
      const products = Array.isArray(rowBranch.products) ? [...rowBranch.products] : [];
      const idx = products.findIndex((p) => p && String(p.id) === String(productId));
      if (idx < 0) throw new AppError("Product not found", 404);
      const merged = normalizeProduct({
        ...products[idx],
        ...patch,
        id: productId,
      });
      await ensureInventoryCategory(tx, br.id, merged.category);
      products[idx] = merged;
      await tx.branch.update({
        where: { id: br.id },
        data: { products },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  );
  return inventoryProfileResponse(reqUser);
}

async function deleteSupplierProductForPortal(reqUser, productId, branchId) {
  const actor = await resolveInventoryActor(reqUser);
  const br = await assertBranchInventoryAccess(actor, branchId);
  await prisma.$transaction(
    async (tx) => {
      const rowBranch = await tx.branch.findUnique({ where: { id: br.id } });
      if (!rowBranch) throw new AppError("Branch not found", 404);
      const products = (Array.isArray(rowBranch.products) ? rowBranch.products : []).filter(
        (p) => p && String(p.id) !== String(productId)
      );
      await tx.branch.update({
        where: { id: br.id },
        data: { products },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  );
  return inventoryProfileResponse(reqUser);
}

function parseCoordField(val, bounds, label) {
  if (val === undefined) return Symbol.for("omit");
  if (val === null || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n)) throw new AppError(`${label} must be a number`, 400);
  const [min, max] = bounds;
  if (n < min || n > max) throw new AppError(`${label} out of range`, 400);
  return n;
}

async function updateSupplierBusinessProfile(userId, body = {}) {
  const row = await requireSupplierOwnedByUserId(userId);
  const businessName = body.businessName !== undefined ? String(body.businessName).trim() || null : row.businessName;
  const address = body.address !== undefined ? String(body.address).trim() || null : row.address;
  const businessPhone =
    body.phone !== undefined ? (body.phone != null ? String(body.phone).trim() : null) : row.phone;
  const hasDelivery =
    body.hasDelivery !== undefined ? Boolean(body.hasDelivery) : Boolean(row.hasDelivery);
  const feeIn = body.deliveryFee !== undefined ? Number(body.deliveryFee) : Number(row.deliveryFee || 0);
  if (!Number.isFinite(feeIn) || feeIn < 0) {
    throw new AppError("deliveryFee must be a non-negative number", 400);
  }
  const deliveryFee = hasDelivery ? feeIn : 0;
  if (body.address !== undefined && !address) {
    throw new AppError("Store / Warehouse address is required", 400);
  }

  let logoPayload = {};
  if (body.logo !== undefined) {
    if (body.logo === null || body.logo === "") {
      logoPayload.logo = null;
    } else {
      logoPayload.logo = String(body.logo).trim();
    }
  }

  const latitudeMark = parseCoordField(body.latitude, [-90, 90], "latitude");
  const longitudeMark = parseCoordField(body.longitude, [-180, 180], "longitude");
  /** When one coordinate cleared, clear both so we don't keep orphan pins. */
  let latitudePayload = {};
  let longitudePayload = {};
  if (
    latitudeMark !== Symbol.for("omit") ||
    longitudeMark !== Symbol.for("omit")
  ) {
    let nextLat = row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null;
    let nextLng = row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null;
    if (latitudeMark !== Symbol.for("omit")) nextLat = latitudeMark;
    if (longitudeMark !== Symbol.for("omit")) nextLng = longitudeMark;
    if (
      latitudeMark !== Symbol.for("omit") ||
      longitudeMark !== Symbol.for("omit")
    ) {
      const hasEither = nextLat !== null || nextLng !== null;
      const missingOne =
        nextLat !== null &&
        Number.isFinite(nextLat) &&
        (nextLng === null || nextLng === undefined || !Number.isFinite(nextLng));
      const missingOther =
        nextLng !== null &&
        Number.isFinite(nextLng) &&
        (nextLat === null || nextLat === undefined || !Number.isFinite(nextLat));
      if ((missingOne || missingOther) && hasEither) {
        throw new AppError(
          "Set both latitude and longitude for a location pin, or clear both.",
          400
        );
      }
    }
    latitudePayload.latitude = Number.isFinite(nextLat) ? nextLat : null;
    longitudePayload.longitude = Number.isFinite(nextLng) ? nextLng : null;
  }

  await prisma.supplier.update({
    where: { id: row.id },
    data: {
      businessName: businessName ?? row.businessName,
      address,
      phone: businessPhone,
      hasDelivery,
      deliveryFee: new Prisma.Decimal(deliveryFee),
      name:
        typeof body.storeDisplayName === "string" && body.storeDisplayName.trim()
          ? body.storeDisplayName.trim()
          : row.name,
      ...latitudePayload,
      ...longitudePayload,
      ...(Object.keys(logoPayload).length ? logoPayload : {}),
    },
  });

  const firstBranch = await prisma.branch.findFirst({
    where: { supplierId: row.id },
    orderBy: { createdAt: "asc" },
  });
  if (firstBranch) {
    const branchData = {
      address: address ?? firstBranch.address,
      hasDelivery,
      deliveryFee: new Prisma.Decimal(deliveryFee),
    };
    if (Object.keys(latitudePayload).length) Object.assign(branchData, latitudePayload);
    if (Object.keys(longitudePayload).length) Object.assign(branchData, longitudePayload);
    await prisma.branch.update({
      where: { id: firstBranch.id },
      data: branchData,
    });
  }

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

async function listInventoryCategoriesForPortal(reqUser, branchId) {
  const actor = await resolveInventoryActor(reqUser);
  const br = await assertBranchInventoryAccess(actor, branchId);
  const sup = await prisma.supplier.findUnique({
    where: { id: br.supplierId },
    select: { userId: true },
  });
  const ownerUserId = sup?.userId ? String(sup.userId) : null;
  if (ownerUserId) await reconcileBranchInventoryCategories(ownerUserId, br.id);
  const rows = await prisma.branchInventoryCategory.findMany({
    where: { branchId: br.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));
}

async function createInventoryCategoryForPortal(reqUser, rawName, branchId) {
  const trimmed = String(rawName ?? "").trim();
  if (!trimmed) {
    throw new AppError("Category name is required", 400);
  }
  const actor = await resolveInventoryActor(reqUser);
  const br = await assertBranchInventoryAccess(actor, branchId);
  const name = normalizeInventoryCategoryKey(trimmed);
  const existing = await prisma.branchInventoryCategory.findFirst({
    where: { branchId: br.id, name },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("A category with this name already exists", 409);
  }
  const id = randomUUID();
  await prisma.branchInventoryCategory.create({
    data: { id, branchId: br.id, name },
  });
  return { id, name };
}

async function patchBranchForBranchStaff(branchUserId, body = {}) {
  const bu = await prisma.branchUser.findUnique({
    where: { id: String(branchUserId || "") },
    include: { branch: true },
  });
  if (!bu) throw new AppError("Branch user not found", 404);
  const br = bu.branch;
  const data = {};

  if (body.address !== undefined) {
    data.address = body.address === null || body.address === "" ? null : String(body.address).trim();
  }
  if (body.city !== undefined) {
    data.city = body.city === null || body.city === "" ? null : String(body.city).trim();
  }
  if (body.area !== undefined) {
    data.area = body.area === null || body.area === "" ? null : String(body.area).trim();
  }
  if (body.contactPhone !== undefined || body.branchPhone !== undefined) {
    const raw = body.contactPhone !== undefined ? body.contactPhone : body.branchPhone;
    data.branchPhone =
      raw === null || raw === ""
        ? null
        : String(raw).trim();
  }
  if (body.contactEmail !== undefined || body.branchEmail !== undefined) {
    const rawIn = body.contactEmail !== undefined ? body.contactEmail : body.branchEmail;
    const raw = rawIn === null || rawIn === "" ? null : String(rawIn).toLowerCase().trim();
    if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      throw new AppError("Invalid contact email", 400);
    }
    data.branchEmail = raw;
  }

  let hasDelivery = Boolean(br.hasDelivery);
  if (body.hasDelivery !== undefined) {
    hasDelivery = Boolean(body.hasDelivery);
    data.hasDelivery = hasDelivery;
  }
  if (body.deliveryFee !== undefined) {
    const feeIn = Number(body.deliveryFee);
    if (!Number.isFinite(feeIn) || feeIn < 0) {
      throw new AppError("deliveryFee must be a non-negative number", 400);
    }
    data.deliveryFee = new Prisma.Decimal(hasDelivery ? feeIn : 0);
  }

  const latitudeMark = parseCoordField(body.latitude, [-90, 90], "latitude");
  const longitudeMark = parseCoordField(body.longitude, [-180, 180], "longitude");
  if (latitudeMark !== Symbol.for("omit") || longitudeMark !== Symbol.for("omit")) {
    let nextLat = br.latitude !== null && br.latitude !== undefined ? Number(br.latitude) : null;
    let nextLng = br.longitude !== null && br.longitude !== undefined ? Number(br.longitude) : null;
    if (latitudeMark !== Symbol.for("omit")) nextLat = latitudeMark;
    if (longitudeMark !== Symbol.for("omit")) nextLng = longitudeMark;
    if (latitudeMark !== Symbol.for("omit") || longitudeMark !== Symbol.for("omit")) {
      const hasEither = nextLat !== null || nextLng !== null;
      const missingOne =
        nextLat !== null &&
        Number.isFinite(nextLat) &&
        (nextLng === null || nextLng === undefined || !Number.isFinite(nextLng));
      const missingOther =
        nextLng !== null &&
        Number.isFinite(nextLng) &&
        (nextLat === null || nextLat === undefined || !Number.isFinite(nextLat));
      if ((missingOne || missingOther) && hasEither) {
        throw new AppError("Set both latitude and longitude for a location pin, or clear both.", 400);
      }
    }
    data.latitude = Number.isFinite(nextLat) ? nextLat : null;
    data.longitude = Number.isFinite(nextLng) ? nextLng : null;
  }

  if (Object.keys(data).length > 0) {
    await prisma.branch.update({
      where: { id: br.id },
      data,
    });
  }
  return getBranchStaffPortalProfile(branchUserId);
}

async function getBranchStaffPortalProfile(branchUserId) {
  const bu = await prisma.branchUser.findUnique({
    where: { id: String(branchUserId || "") },
    include: { branch: { include: { supplier: true } } },
  });
  if (!bu) return null;
  const row = bu.branch.supplier;
  const supOwnerId = row.userId ? String(row.userId) : null;
  if (supOwnerId) {
    await reconcileBranchInventoryCategories(supOwnerId, bu.branchId);
  }
  const pub = rowToPublicApi(row, { omitInternal: false });
  pub.branches = [branchService.branchToPublicApi(bu.branch, row, { omitInternal: false })];
  return {
    ...pub,
    supplierLogo: row.logo || undefined,
    accountEmail: bu.email,
    loginEmail: bu.email,
    displayName: bu.email,
    accountPhone: null,
    role: "BRANCH_STAFF",
    branchUserRole: bu.role,
  };
}

module.exports = {
  PLATFORM_COMMISSION_RATE,
  SUPPLIER_SHARE_RATE,
  splitMaterialsCommission,
  splitStoreDeliveryCommission,
  buildOrderFinanceBreakdown,
  normalizeDeliveryTypeKey,
  normalizeProduct,
  normalizeSupplierSeed,
  rowToPublicApi,
  listSuppliersForPublicCatalog,
  listStoresForLocation,
  getStoreProductListById,
  getProductsByCategory,
  getSupplierById,
  getSupplierDetailsForAdmin,
  listSuppliersForAdminDashboard,
  provisionSupplierByAdmin,
  getSupplierProfileByUserId,
  getBranchStaffPortalProfile,
  patchBranchForBranchStaff,
  requireSupplierOwnedByUserId,
  upsertSupplierProductForPortal,
  updateSupplierProductForPortal,
  deleteSupplierProductForPortal,
  updateSupplierBusinessProfile,
  findSupplierRecordByUserId,
  normalizeInventoryCategoryKey,
  listInventoryCategoriesForPortal,
  createInventoryCategoryForPortal,
};
