/**
 * Metro-level service area matching for provider discovery and branch listing.
 * Aligns customer suburbs (e.g. Milnerton) with provider metros (e.g. Cape Town).
 */

const SERVICE_METROS = [
  "Johannesburg",
  "Pretoria",
  "Cape Town",
  "Durban",
  "Port Elizabeth",
  "Bloemfontein",
];

/** Common SA suburbs that do not contain a metro name in the string itself. */
const SUBURB_TO_METRO = {
  midrand: "Johannesburg",
  sandton: "Johannesburg",
  roodepoort: "Johannesburg",
  randburg: "Johannesburg",
  soweto: "Johannesburg",
  benoni: "Johannesburg",
  boksburg: "Johannesburg",
  germiston: "Johannesburg",
  alberton: "Johannesburg",
  edenvale: "Johannesburg",
  fourways: "Johannesburg",
  milnerton: "Cape Town",
  bellville: "Cape Town",
  durbanville: "Cape Town",
  "somerset west": "Cape Town",
  parow: "Cape Town",
  brackenfell: "Cape Town",
  constantia: "Cape Town",
  claremont: "Cape Town",
  rondebosch: "Cape Town",
  observatory: "Cape Town",
  woodstock: "Cape Town",
  blouberg: "Cape Town",
  bloubergstrand: "Cape Town",
  centurion: "Pretoria",
  menlyn: "Pretoria",
  hatfield: "Pretoria",
  pinetown: "Durban",
  umhlanga: "Durban",
  westville: "Durban",
  gqeberha: "Port Elizabeth",
};

/** Rough bounding boxes [minLat, maxLat, minLng, maxLng] for coordinate-based metro resolution. */
const METRO_BBOX = {
  "Cape Town": [-34.35, -33.4, 18.3, 19.05],
  Johannesburg: [-26.55, -25.85, 27.75, 28.35],
  Pretoria: [-25.95, -25.55, 28.05, 28.45],
  Durban: [-30.15, -29.65, 30.75, 31.15],
  "Port Elizabeth": [-34.05, -33.7, 25.4, 25.95],
  Bloemfontein: [-29.25, -29.05, 26.1, 26.3],
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Extract metro from a suburb name via lookup table (whole-word / exact match).
 * @param {string} text
 * @returns {string|null}
 */
function extractMetroFromSuburb(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const normalized = normalizeText(raw);
  if (SUBURB_TO_METRO[normalized]) return SUBURB_TO_METRO[normalized];

  for (const [suburb, metro] of Object.entries(SUBURB_TO_METRO)) {
    const re = new RegExp(`\\b${suburb.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(normalized)) return metro;
  }

  return null;
}

/**
 * Extract a canonical metro name from free text (e.g. "City of Cape Town" → "Cape Town").
 * @param {string} text
 * @returns {string|null}
 */
function extractMetroFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const cityOfMatch = raw.match(/^city\s+of\s+(.+)$/i);
  const candidate = cityOfMatch ? cityOfMatch[1].trim() : raw;
  const normalized = normalizeText(candidate);
  if (!normalized) return null;

  for (const metro of SERVICE_METROS) {
    const metroNorm = normalizeText(metro);
    if (normalized === metroNorm || normalized.includes(metroNorm) || metroNorm.includes(normalized)) {
      return metro;
    }
  }

  return extractMetroFromSuburb(candidate);
}

/**
 * Resolve metro from lat/lng using bounding boxes.
 * @param {number} lat
 * @param {number} lng
 * @returns {string|null}
 */
function resolveMetroFromCoordinates(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

  for (const metro of SERVICE_METROS) {
    const bbox = METRO_BBOX[metro];
    if (!bbox) continue;
    const [minLat, maxLat, minLng, maxLng] = bbox;
    if (latNum >= minLat && latNum <= maxLat && lngNum >= minLng && lngNum <= maxLng) {
      return metro;
    }
  }

  return null;
}

/**
 * @param {{ metro?: string, city?: string, area?: string, suburb?: string }} location
 * @returns {string[]}
 */
function resolveCustomerMetros(location = {}) {
  const metros = new Set();
  const fields = [location.metro, location.city, location.area, location.suburb];

  for (const field of fields) {
    const extracted = extractMetroFromText(field);
    if (extracted) metros.add(extracted);
  }

  return [...metros];
}

/**
 * Resolve customer metros from location fields and optional coordinates.
 * @param {{ metro?: string, city?: string, area?: string, suburb?: string }} location
 * @param {number|undefined} lat
 * @param {number|undefined} lng
 * @returns {string[]}
 */
function resolveCustomerMetrosWithCoords(location = {}, lat, lng) {
  const fromCoords = resolveMetroFromCoordinates(lat, lng);
  if (fromCoords) return [fromCoords];
  return resolveCustomerMetros(location);
}

/**
 * @param {string[]} serviceAreas
 * @returns {{ metros: string[], custom: string[] }}
 */
function resolveProviderMetros(serviceAreas) {
  const metros = new Set();
  const custom = [];

  for (const area of serviceAreas || []) {
    const trimmed = String(area || "").trim();
    if (!trimmed) continue;
    const extracted = extractMetroFromText(trimmed);
    if (extracted) {
      metros.add(extracted);
    } else {
      custom.push(trimmed);
    }
  }

  return { metros: [...metros], custom };
}

/**
 * @param {{ city?: string, area?: string, address?: string, name?: string, displayName?: string, latitude?: number, longitude?: number }} branch
 * @returns {string[]}
 */
function resolveBranchMetros(branch = {}) {
  const metros = new Set();

  for (const field of [branch.city, branch.area, branch.address]) {
    const extracted = extractMetroFromText(field);
    if (extracted) metros.add(extracted);
  }
  if (metros.size > 0) return [...metros];

  const fromCoords = resolveMetroFromCoordinates(branch.latitude, branch.longitude);
  if (fromCoords) return [fromCoords];

  for (const field of [branch.name, branch.displayName]) {
    const extracted = extractMetroFromText(field);
    if (extracted) metros.add(extracted);
  }

  return [...metros];
}

function stringsOverlap(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

/**
 * @param {{ metro?: string, city?: string, area?: string, suburb?: string }} location
 * @returns {boolean}
 */
function customerLocationHasFields(location) {
  if (!location || typeof location !== "object") return false;
  return Boolean(
    String(location.metro || "").trim() ||
      String(location.city || "").trim() ||
      String(location.area || "").trim() ||
      String(location.suburb || "").trim()
  );
}

function metrosOverlap(customerMetros, entityMetros) {
  if (!customerMetros.length || !entityMetros.length) return false;
  for (const customerMetro of customerMetros) {
    for (const entityMetro of entityMetros) {
      if (normalizeText(customerMetro) === normalizeText(entityMetro)) return true;
    }
  }
  return false;
}

/**
 * @param {{ city?: string, serviceAreas?: string[] }} provider
 * @param {{ metro?: string, city?: string, area?: string, suburb?: string }} customerLocation
 * @returns {boolean}
 */
function providerMatchesCustomerLocation(provider, customerLocation) {
  if (!customerLocationHasFields(customerLocation)) return true;

  const customerMetros = resolveCustomerMetros(customerLocation);
  const { metros: providerMetros, custom } = resolveProviderMetros(provider?.serviceAreas);
  const providerMetroSet = new Set(providerMetros);

  const providerCityMetro = extractMetroFromText(provider?.city);
  if (providerCityMetro) providerMetroSet.add(providerCityMetro);

  if (customerMetros.length > 0 && providerMetroSet.size > 0) {
    if (metrosOverlap(customerMetros, [...providerMetroSet])) return true;
  }

  const customerTokens = [customerLocation.city, customerLocation.area, customerLocation.suburb]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const providerTokens = [...(provider?.serviceAreas || []), provider?.city, ...custom]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const customerToken of customerTokens) {
    for (const providerToken of providerTokens) {
      if (stringsOverlap(customerToken, providerToken)) return true;
    }
  }

  return false;
}

/**
 * @param {{ city?: string, area?: string, address?: string, name?: string, displayName?: string, latitude?: number, longitude?: number }} branch
 * @param {{ metro?: string, city?: string, area?: string, suburb?: string }} customerLocation
 * @param {string[]} [customerMetros] - pre-resolved customer metros (optional)
 * @returns {boolean}
 */
function branchMatchesCustomerLocation(branch, customerLocation, customerMetros) {
  const resolvedCustomerMetros =
    Array.isArray(customerMetros) && customerMetros.length > 0
      ? customerMetros
      : resolveCustomerMetros(customerLocation);

  if (resolvedCustomerMetros.length === 0) return true;

  const branchMetros = resolveBranchMetros(branch);
  if (branchMetros.length > 0) {
    return metrosOverlap(resolvedCustomerMetros, branchMetros);
  }

  return false;
}

module.exports = {
  SERVICE_METROS,
  SUBURB_TO_METRO,
  extractMetroFromText,
  extractMetroFromSuburb,
  resolveMetroFromCoordinates,
  resolveCustomerMetros,
  resolveCustomerMetrosWithCoords,
  resolveProviderMetros,
  resolveBranchMetros,
  customerLocationHasFields,
  providerMatchesCustomerLocation,
  branchMatchesCustomerLocation,
};
