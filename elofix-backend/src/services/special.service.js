const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");

function rowToDeliveryProvider(row) {
  return {
    id: row.id,
    name: row.name,
    logo: row.logo || undefined,
    baseRate: Number(row.baseRate),
    perKmRate: Number(row.perKmRate),
    estimatedTime: row.estimatedTime,
    vehicleType: row.vehicleType || undefined,
    numberPlate: row.numberPlate || undefined,
    rating: row.rating != null ? Number(row.rating) : undefined,
  };
}

async function listSpecials({ supplierId, category } = {}) {
  const rows = await prisma.promoSpecial.findMany();
  let specials = rows.map((r) => (r.data && typeof r.data === "object" ? r.data : {}));
  if (supplierId) {
    specials = specials.filter((s) => String(s.supplierId) === String(supplierId));
  }
  if (category) {
    specials = specials.filter((s) => String(s.category).toLowerCase() === String(category).toLowerCase());
  }
  return specials;
}

async function listDeliveryProviders() {
  const rows = await prisma.deliveryProvider.findMany({ orderBy: { name: "asc" } });
  return rows.map(rowToDeliveryProvider);
}

async function seedDefaultsIfEmpty() {
  const count = await prisma.deliveryProvider.count();
  if (count > 0) return;
}

async function createDeliveryProvider(payload) {
  const id = String(payload.id || randomUUID());
  const row = await prisma.deliveryProvider.create({
    data: {
      id,
      name: String(payload.name || "").trim(),
      logo: payload.logo || null,
      baseRate: Number(payload.baseRate || 0),
      perKmRate: Number(payload.perKmRate || 0),
      estimatedTime: String(payload.estimatedTime || "N/A"),
      vehicleType: payload.vehicleType || null,
      numberPlate: payload.numberPlate || null,
      rating: payload.rating != null ? Number(payload.rating) : null,
    },
  });
  return rowToDeliveryProvider(row);
}

module.exports = {
  listSpecials,
  listDeliveryProviders,
  seedDefaultsIfEmpty,
  createDeliveryProvider,
};
