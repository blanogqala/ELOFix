const { randomUUID } = require("crypto");
const { readState, updateState } = require("./jsonStore.service");

async function listSpecials({ supplierId, category } = {}) {
  const state = await readState();
  let specials = state.specials || [];
  if (supplierId) {
    specials = specials.filter((s) => String(s.supplierId) === String(supplierId));
  }
  if (category) {
    specials = specials.filter((s) => String(s.category).toLowerCase() === String(category).toLowerCase());
  }
  return specials;
}

async function listDeliveryProviders() {
  const state = await readState();
  return state.deliveryProviders || [];
}

async function seedDefaultsIfEmpty() {
  await updateState((state) => {
    if (!Array.isArray(state.deliveryProviders) || state.deliveryProviders.length > 0) {
      return state;
    }
    state.deliveryProviders = [];
    return state;
  });
}

async function createDeliveryProvider(payload) {
  const provider = {
    id: String(payload.id || randomUUID()),
    name: String(payload.name || "").trim(),
    logo: payload.logo || undefined,
    baseRate: Number(payload.baseRate || 0),
    perKmRate: Number(payload.perKmRate || 0),
    estimatedTime: String(payload.estimatedTime || "N/A"),
    vehicleType: payload.vehicleType || undefined,
    numberPlate: payload.numberPlate || undefined,
    rating: payload.rating != null ? Number(payload.rating) : undefined,
  };
  await updateState((state) => {
    state.deliveryProviders = [...(state.deliveryProviders || []), provider];
    return state;
  });
  return provider;
}

module.exports = {
  listSpecials,
  listDeliveryProviders,
  seedDefaultsIfEmpty,
  createDeliveryProvider,
};
