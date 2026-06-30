/**
 * Metro-level service area matching for provider discovery.
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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
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
    for (const customerMetro of customerMetros) {
      for (const providerMetro of providerMetroSet) {
        if (normalizeText(customerMetro) === normalizeText(providerMetro)) {
          return true;
        }
      }
    }
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

module.exports = {
  SERVICE_METROS,
  extractMetroFromText,
  resolveCustomerMetros,
  resolveProviderMetros,
  customerLocationHasFields,
  providerMatchesCustomerLocation,
};
