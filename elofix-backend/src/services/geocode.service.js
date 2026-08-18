const AppError = require("../utils/AppError");
const { extractMetroFromText } = require("../utils/serviceAreaMatch.util");

const UA = process.env.GEOCODE_USER_AGENT || "ELOFix/1.0";
const CONTACT = process.env.GEOCODE_CONTACT_EMAIL || "";

const FETCH_MS = Math.min(Math.max(Number(process.env.GEOCODE_FETCH_TIMEOUT_MS) || 20000, 5000), 60000);

function pickCity(components) {
  if (!components || typeof components !== "object") return "";
  return (
    components.city ||
    components.town ||
    components.village ||
    components.municipality ||
    components.city_district ||
    components.county ||
    ""
  );
}

function pickSuburb(components) {
  if (!components || typeof components !== "object") return "";
  return (
    components.suburb ||
    components.neighbourhood ||
    components.quarter ||
    components.hamlet ||
    ""
  );
}

/** Street-level line only (building + road); for form autofills. */
function pickStreetOnly(c) {
  if (!c || typeof c !== "object") return "";
  const num = String(c.house_number || "").trim();
  const road = String(c.road || "").trim();
  const line = [num, road].filter(Boolean).join(" ").trim();
  if (line) return line;
  const poi = String(c.amenity || c.building || c.retail || "").trim();
  return poi || "";
}

function buildLineFromComponents(c) {
  if (!c || typeof c !== "object") return "";
  const street = pickStreetOnly(c);
  const suburb = String(pickSuburb(c) || "").trim();
  const city = String(pickCity(c) || "").trim();
  const state = String(c.state || "").trim();
  const parts = [];
  if (street) parts.push(street);
  if (suburb) parts.push(suburb);
  if (city) parts.push(city);
  if (state && state !== city && !parts.includes(state)) parts.push(state);
  return parts.filter(Boolean).join(", ");
}

/** Resolve canonical service metro from geocoder components (municipality preferred). */
function deriveMetro(components) {
  const c = components || {};
  const municipality = String(c.municipality || "").trim();
  const state = String(c.state || c.region || "").trim();
  const city = String(pickCity(c) || "").trim();
  return (
    extractMetroFromText(municipality) ||
    extractMetroFromText(state) ||
    extractMetroFromText(city) ||
    undefined
  );
}

/** City/town field: suburb missing → area uses city; city missing → use state */
function deriveCityAndSuburb(components) {
  const c = components || {};
  let suburb = String(pickSuburb(c) || "").trim();
  let city = String(pickCity(c) || "").trim();
  if (!city) {
    city = String(c.state || c.region || "").trim();
  }
  const area = suburb || city || undefined;
  return { city, suburb: suburb || undefined, area };
}

function finalizeAddress(formatted, builtLine) {
  const addr = String(formatted || builtLine || "").trim();
  if (!addr) {
    throw new AppError("Unable to resolve a readable address for these coordinates", 502);
  }
  return addr;
}

function mapOpenCage(data, lat, lng) {
  const first = data?.results?.[0];
  if (!first) {
    throw new AppError("No address found for these coordinates", 404);
  }
  const c = first.components || {};
  const { city, suburb, area } = deriveCityAndSuburb(c);
  const metro = deriveMetro(c);
  const builtLine = buildLineFromComponents(c);
  const formatted = String(first.formatted || "").trim();
  const address = finalizeAddress(formatted || builtLine, builtLine);

  const streetOnly = pickStreetOnly(c);

  return {
    fullAddress: address,
    address,
    street:
      streetOnly ||
      (formatted || builtLine)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)[0] ||
      "",
    city: city || area || address.split(",")[0]?.trim() || "",
    suburb,
    area,
    metro,
    coordinates: { lat, lng },
  };
}

function mapNominatim(data, lat, lng) {
  const a = data?.address || {};
  const { city, suburb, area } = deriveCityAndSuburb(a);
  const metro = deriveMetro(a);
  const builtLine = buildLineFromComponents(a);
  const display = String(data?.display_name || "").trim();
  const address = finalizeAddress(display || builtLine, builtLine);

  const streetOnly = pickStreetOnly(a);

  return {
    fullAddress: address,
    address,
    street:
      streetOnly ||
      (display || builtLine)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)[0] ||
      "",
    city: city || area || (display ? display.split(",")[1]?.trim() : "") || "",
    suburb,
    area,
    metro,
    coordinates: { lat, lng },
  };
}

async function reverseGeocode(lat, lng) {
  const key = process.env.OPENCAGE_API_KEY;
  if (key && String(key).trim()) {
    try {
      const q = encodeURIComponent(`${lat},${lng}`);
      const url = `https://api.opencagedata.com/geocode/v1/json?q=${q}&key=${encodeURIComponent(
        key.trim()
      )}&no_annotations=1`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_MS),
      });
      if (!res.ok) {
        throw new AppError(`OpenCage error (${res.status})`, 502);
      }
      const data = await res.json();
      if (data.status?.code && data.status.code !== 200) {
        throw new AppError(data.status.message || "OpenCage geocoding failed", 502);
      }
      return mapOpenCage(data, lat, lng);
    } catch (err) {
      console.warn("[geocode] OpenCage reverse failed, trying fallback:", err?.message || err);
    }
  }

  const emailQuery = CONTACT ? `&email=${encodeURIComponent(CONTACT)}` : "";
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(
    lat
  )}&lon=${encodeURIComponent(lng)}&format=json${emailQuery}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
    },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) {
    throw new AppError("Unable to fetch address", 502);
  }
  const data = await res.json();
  if (data.error) {
    throw new AppError("Unable to fetch address", 502);
  }
  return mapNominatim(data, lat, lng);
}

const CACHE_MAX = 200;
const CACHE_TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, { value: unknown; expiresAt: number }>} */
const queryCache = new Map();

function cacheGet(key) {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (queryCache.size >= CACHE_MAX) {
    const first = queryCache.keys().next().value;
    if (first) queryCache.delete(first);
  }
  queryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function sanitizeQuery(raw) {
  const q = String(raw || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .trim()
    .slice(0, 256);
  if (!q || q.length < 2) {
    throw new AppError("Query must be at least 2 characters", 400);
  }
  return q;
}

function nominatimHeaders() {
  return {
    Accept: "application/json",
    "User-Agent": UA,
  };
}

async function nominatimSearch(query, limit = 5) {
  const emailQuery = CONTACT ? `&email=${encodeURIComponent(CONTACT)}` : "";
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
    `&format=json&addressdetails=1&limit=${limit}&countrycodes=za${emailQuery}`;
  const res = await fetch(url, {
    headers: nominatimHeaders(),
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) {
    throw new AppError("Unable to search addresses", 502);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new AppError("Invalid geocoder response", 502);
  }
  return data;
}

function mapNominatimSearchItem(item) {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  const label = String(item.display_name || "").trim();
  return {
    label,
    lat,
    lng,
    coordinates: { lat, lng },
  };
}

function normalizeForwardQuery(raw) {
  let q = sanitizeQuery(raw);
  const fixes = [
    [/\bbelliville\b/gi, 'Bellville'],
    [/\bbellville\b/gi, 'Bellville'],
    [/\bcapetown\b/gi, 'Cape Town'],
    [/\bjhb\b/gi, 'Johannesburg'],
  ];
  for (const [pattern, replacement] of fixes) {
    q = q.replace(pattern, replacement);
  }
  return q;
}

function forwardQueryVariants(query) {
  const base = normalizeForwardQuery(query);
  const parts = base
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const dedupedParts = [];
  const seen = new Set();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedParts.push(part);
  }
  const deduped = dedupedParts.join(", ");
  const variants = [deduped || base];
  if (base !== deduped) variants.unshift(base);
  if (!/\bsouth africa\b/i.test(deduped || base)) {
    variants.push(`${deduped || base}, South Africa`);
  }
  if (dedupedParts.length >= 2) {
    variants.push(`${dedupedParts[0]}, ${dedupedParts[dedupedParts.length - 1]}, South Africa`);
  }
  if (dedupedParts.length >= 3) {
    variants.push(`${dedupedParts[0]}, ${dedupedParts[1]}, South Africa`);
  }
  return [...new Set(variants)];
}

async function forwardGeocode(query) {
  const variants = forwardQueryVariants(query);

  for (const variant of variants) {
    const cacheKey = `forward:${variant.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const results = await nominatimSearch(variant, 3);
    const first = results[0];
    if (!first) continue;

    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const payload = {
      lat,
      lng,
      coordinates: { lat, lng },
      label: String(first.display_name || variant).trim(),
    };
    cacheSet(cacheKey, payload);
    return payload;
  }

  throw new AppError("No location found for this address", 404);
}

async function searchAddresses(query) {
  const q = sanitizeQuery(query);
  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const results = await nominatimSearch(q, 8);
  const suggestions = results
    .map(mapNominatimSearchItem)
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.label);
  const payload = { suggestions };
  cacheSet(cacheKey, payload);
  return payload;
}

module.exports = {
  reverseGeocode,
  forwardGeocode,
  searchAddresses,
};
