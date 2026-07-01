const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const {
  branchMatchesCustomerLocation,
  resolveCustomerMetrosWithCoords,
} = require("../utils/serviceAreaMatch.util");

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function branchPublicDisplay(branch, supplierRow) {
  const brand = String(supplierRow.brandName || "").trim();
  const bname = String(branch.name || "").trim();
  const legal = String(supplierRow.name || "").trim();
  if (brand && bname) {
    if (brand.toLowerCase() === bname.toLowerCase()) return brand;
    return `${brand} - ${bname}`;
  }
  if (bname && legal) {
    if (legal.toLowerCase() === bname.toLowerCase()) return legal;
    return `${legal} - ${bname}`;
  }
  return legal || brand || bname || "Store";
}

function safeJsonClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function branchToPublicApi(branch, supplierRow, { omitInternal = true } = {}) {
  const rawProducts = Array.isArray(branch.products) ? branch.products : [];
  const products = [];
  for (const p of rawProducts) {
    if (!p || typeof p !== "object") continue;
    const cloned = safeJsonClone(p);
    if (cloned && typeof cloned === "object") products.push(cloned);
  }
  const latNum =
    branch.latitude !== undefined && branch.latitude !== null && String(branch.latitude) !== ""
      ? Number(branch.latitude)
      : undefined;
  const lngNum =
    branch.longitude !== undefined && branch.longitude !== null && String(branch.longitude) !== ""
      ? Number(branch.longitude)
      : undefined;
  const cityField =
    branch.city != null && String(branch.city).trim() ? String(branch.city).trim() : undefined;
  const areaField =
    branch.area != null && String(branch.area).trim() ? String(branch.area).trim() : undefined;
  const contactPhone =
    branch.branchPhone != null && String(branch.branchPhone).trim()
      ? String(branch.branchPhone).trim()
      : undefined;
  const contactEmail =
    branch.branchEmail != null && String(branch.branchEmail).trim()
      ? String(branch.branchEmail).trim()
      : undefined;
  const supplierPhone =
    supplierRow.phone != null && String(supplierRow.phone).trim()
      ? String(supplierRow.phone).trim()
      : undefined;
  const base = {
    id: branch.id,
    branchId: branch.id,
    supplierId: supplierRow.id,
    name: branch.name,
    displayName: branchPublicDisplay(branch, supplierRow),
    brandName: supplierRow.brandName != null && String(supplierRow.brandName).trim()
      ? String(supplierRow.brandName).trim()
      : undefined,
    city: cityField,
    area: areaField,
    logo: supplierRow.logo || undefined,
    hasDelivery: branch.hasDelivery,
    deliveryFee: (() => {
      const n = Number(branch.deliveryFee ?? 0);
      return Number.isFinite(n) ? n : 0;
    })(),
    products,
    businessName: supplierRow.businessName || undefined,
    address: branch.address || undefined,
    phone: contactPhone || supplierPhone || undefined,
    contactPhone: contactPhone || undefined,
    contactEmail: contactEmail || undefined,
    latitude: Number.isFinite(latNum) ? latNum : undefined,
    longitude: Number.isFinite(lngNum) ? lngNum : undefined,
  };
  if (!omitInternal) {
    base.isActive = Boolean(branch.isActive);
    base.createdAt =
      branch.createdAt instanceof Date
        ? branch.createdAt.toISOString()
        : branch.createdAt
          ? String(branch.createdAt)
          : undefined;
    base.updatedAt =
      branch.updatedAt instanceof Date ? branch.updatedAt.toISOString() : branch.updatedAt || undefined;
  }
  return base;
}

/**
 * Public branch list with optional geo / city / search (same query shape as legacy /stores).
 */
async function listBranchesForLocation(query = {}) {
  const latRaw = query.lat != null ? Number(query.lat) : NaN;
  const lngRaw = query.lng != null ? Number(query.lng) : NaN;
  const hasUserCoords = Number.isFinite(latRaw) && Number.isFinite(lngRaw);
  const radiusKm = Number(query.radiusKm) > 0 ? Number(query.radiusKm) : 120;
  const qRaw = String(query.q || "")
    .trim()
    .toLowerCase();

  const customerLocation = {
    metro: String(query.metro || "").trim() || undefined,
    city: String(query.city || "").trim() || undefined,
    area: String(query.area || "").trim() || undefined,
    suburb: String(query.suburb || "").trim() || undefined,
  };

  const customerMetros = resolveCustomerMetrosWithCoords(
    customerLocation,
    hasUserCoords ? latRaw : undefined,
    hasUserCoords ? lngRaw : undefined
  );
  const hasCustomerMetro = customerMetros.length > 0;

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    include: { supplier: true },
    orderBy: { name: "asc" },
  });

  let list = branches.map((b) => {
    const sup = b.supplier;
    const api = branchToPublicApi(b, sup, { omitInternal: true });
    let distanceKm = null;
    if (hasUserCoords && typeof api.latitude === "number" && typeof api.longitude === "number") {
      distanceKm = haversineKm(latRaw, lngRaw, api.latitude, api.longitude);
    }
    return { ...api, distanceKm };
  });

  if (hasCustomerMetro) {
    list = list.filter((s) =>
      branchMatchesCustomerLocation(
        {
          city: s.city,
          area: s.area,
          address: s.address,
          name: s.name,
          displayName: s.displayName,
          latitude: s.latitude,
          longitude: s.longitude,
        },
        customerLocation,
        customerMetros
      )
    );
  } else if (hasUserCoords) {
    list = list.filter((s) => s.distanceKm != null && s.distanceKm <= radiusKm);
  }

  if (qRaw) {
    const tokens = qRaw.split(/\s+/).filter(Boolean);
    list = list.filter((s) => {
      const hay = [
        s.displayName,
        s.name,
        s.brandName,
        s.businessName,
        s.city,
        s.area,
        s.address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return tokens.every(
        (t) => hay.includes(t) || hay.split(/\s+/).some((w) => w.startsWith(t))
      );
    });
  }

  list.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    if (a.distanceKm != null && b.distanceKm == null) return -1;
    if (a.distanceKm == null && b.distanceKm != null) return 1;
    return String(a.displayName || a.name).localeCompare(String(b.displayName || b.name));
  });

  return list;
}

async function getBranchByIdWithSupplier(branchId) {
  return prisma.branch.findUnique({
    where: { id: String(branchId || "") },
    include: { supplier: true },
  });
}

async function getBranchProductsById(branchId) {
  const row = await prisma.branch.findUnique({ where: { id: String(branchId || "") } });
  if (!row) return [];
  const products = Array.isArray(row.products) ? row.products : [];
  return products;
}

async function assertBranchOwnedByUser(branchId, userId) {
  const b = await prisma.branch.findUnique({
    where: { id: String(branchId || "") },
    include: { supplier: true },
  });
  if (!b) throw new AppError("Branch not found", 404);
  if (String(b.supplier.userId || "") !== String(userId || "")) {
    throw new AppError("Forbidden", 403);
  }
  return b;
}

function parseOptionalArea(body, key = "area") {
  if (body[key] === undefined) return Symbol.for("omit");
  if (body[key] === null || body[key] === "") return null;
  return String(body[key]).trim() || null;
}

function parseOptionalBranchPhone(body) {
  if (body.contactPhone !== undefined || body.branchPhone !== undefined) {
    const raw = body.contactPhone !== undefined ? body.contactPhone : body.branchPhone;
    if (raw === null || raw === "") return null;
    return String(raw).trim() || null;
  }
  return Symbol.for("omit");
}

function parseOptionalBranchEmail(body) {
  if (body.contactEmail !== undefined || body.branchEmail !== undefined) {
    const rawIn = body.contactEmail !== undefined ? body.contactEmail : body.branchEmail;
    if (rawIn === null || rawIn === "") return null;
    const raw = String(rawIn).toLowerCase().trim();
    if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      throw new AppError("Invalid contact email", 400);
    }
    return raw;
  }
  return Symbol.for("omit");
}

async function getBranchForSupplierUser(userId, branchId) {
  const b = await assertBranchOwnedByUser(branchId, userId);
  return branchToPublicApi(b, b.supplier, { omitInternal: false });
}

async function deleteBranchForSupplierUser(userId, branchId) {
  const id = String(branchId || "").trim();
  if (!id) throw new AppError("Branch not found", 404);
  await assertBranchOwnedByUser(id, userId);
  const orderCount = await prisma.materialOrder.count({ where: { branchId: id } });
  if (orderCount > 0) {
    throw new AppError(
      "This branch has material orders on record and cannot be deleted. Deactivate it (turn off Active) to hide it from customers, or contact support.",
      409
    );
  }
  await prisma.branch.delete({ where: { id } });
}

async function listBranchesForSupplierUser(userId) {
  const sup = await prisma.supplier.findFirst({ where: { userId: String(userId || "") } });
  if (!sup) return [];
  const rows = await prisma.branch.findMany({
    where: { supplierId: sup.id },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((b) => branchToPublicApi(b, sup, { omitInternal: false }));
}

async function createBranchForSupplierUser(userId, body = {}) {
  const sup = await prisma.supplier.findFirst({ where: { userId: String(userId || "") } });
  if (!sup) throw new AppError("Supplier not found", 404);
  const name = String(body.name || "").trim();
  if (!name) throw new AppError("Branch name is required", 400);
  const address = body.address != null ? String(body.address).trim() || null : null;
  const city = body.city != null ? String(body.city).trim() || null : null;
  const hasDelivery = body.hasDelivery !== undefined ? Boolean(body.hasDelivery) : true;
  const feeRaw = body.deliveryFee !== undefined ? Number(body.deliveryFee) : 0;
  if (!Number.isFinite(feeRaw) || feeRaw < 0) throw new AppError("deliveryFee must be a non-negative number", 400);
  const deliveryFee = hasDelivery ? feeRaw : 0;
  let latitude = null;
  let longitude = null;
  if (body.latitude !== undefined && body.latitude !== null && String(body.latitude) !== "") {
    latitude = Number(body.latitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new AppError("latitude out of range", 400);
    }
  }
  if (body.longitude !== undefined && body.longitude !== null && String(body.longitude) !== "") {
    longitude = Number(body.longitude);
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new AppError("longitude out of range", 400);
    }
  }
  if ((latitude != null) !== (longitude != null)) {
    throw new AppError("Set both latitude and longitude, or neither.", 400);
  }

  const area =
    body.area != null && String(body.area).trim() ? String(body.area).trim() : null;
  let branchPhone = null;
  if (body.contactPhone !== undefined || body.branchPhone !== undefined) {
    const raw = body.contactPhone !== undefined ? body.contactPhone : body.branchPhone;
    branchPhone = raw != null && String(raw).trim() ? String(raw).trim() : null;
  }
  let branchEmail = null;
  if (body.contactEmail !== undefined || body.branchEmail !== undefined) {
    const rawIn = body.contactEmail !== undefined ? body.contactEmail : body.branchEmail;
    if (rawIn != null && String(rawIn).trim()) {
      branchEmail = String(rawIn).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(branchEmail)) {
        throw new AppError("Invalid contact email", 400);
      }
    }
  }

  const row = await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId: sup.id,
      name,
      address,
      city,
      area,
      branchPhone,
      branchEmail,
      latitude,
      longitude,
      hasDelivery,
      deliveryFee: new Prisma.Decimal(deliveryFee),
      products: [],
      isActive: body.isActive !== false,
    },
  });
  return branchToPublicApi(row, sup, { omitInternal: false });
}

async function updateBranchForSupplierUser(userId, branchId, body = {}) {
  const b = await assertBranchOwnedByUser(branchId, userId);
  const sup = b.supplier;
  const data = {};
  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) throw new AppError("Branch name is required", 400);
    data.name = name;
  }
  if (body.address !== undefined) data.address = body.address != null ? String(body.address).trim() || null : null;
  if (body.city !== undefined) data.city = body.city != null ? String(body.city).trim() || null : null;
  const areaMark = parseOptionalArea(body);
  if (areaMark !== Symbol.for("omit")) data.area = areaMark;
  const phoneMark = parseOptionalBranchPhone(body);
  if (phoneMark !== Symbol.for("omit")) data.branchPhone = phoneMark;
  const emailMark = parseOptionalBranchEmail(body);
  if (emailMark !== Symbol.for("omit")) data.branchEmail = emailMark;
  let hasDelivery = Boolean(b.hasDelivery);
  if (body.hasDelivery !== undefined) {
    hasDelivery = Boolean(body.hasDelivery);
    data.hasDelivery = hasDelivery;
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.deliveryFee !== undefined) {
    const fee = Number(body.deliveryFee);
    if (!Number.isFinite(fee) || fee < 0) throw new AppError("deliveryFee must be a non-negative number", 400);
    data.deliveryFee = new Prisma.Decimal(hasDelivery ? fee : 0);
  } else if (body.hasDelivery !== undefined && !hasDelivery) {
    data.deliveryFee = new Prisma.Decimal(0);
  }
  if (body.latitude !== undefined) {
    if (body.latitude === null || body.latitude === "") data.latitude = null;
    else {
      const lat = Number(body.latitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new AppError("latitude out of range", 400);
      data.latitude = lat;
    }
  }
  if (body.longitude !== undefined) {
    if (body.longitude === null || body.longitude === "") data.longitude = null;
    else {
      const lng = Number(body.longitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new AppError("longitude out of range", 400);
      data.longitude = lng;
    }
  }

  const updated =
    Object.keys(data).length > 0
      ? await prisma.branch.update({
          where: { id: b.id },
          data,
        })
      : await prisma.branch.findUnique({ where: { id: b.id } });
  return branchToPublicApi(updated, sup, { omitInternal: false });
}

module.exports = {
  haversineKm,
  branchPublicDisplay,
  branchToPublicApi,
  listBranchesForLocation,
  getBranchByIdWithSupplier,
  getBranchProductsById,
  assertBranchOwnedByUser,
  listBranchesForSupplierUser,
  getBranchForSupplierUser,
  createBranchForSupplierUser,
  updateBranchForSupplierUser,
  deleteBranchForSupplierUser,
};
