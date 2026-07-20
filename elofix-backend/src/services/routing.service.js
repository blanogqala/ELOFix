const AppError = require("../utils/AppError");

const FETCH_MS = Math.min(
  Math.max(Number(process.env.ROUTING_FETCH_TIMEOUT_MS) || 15000, 5000),
  60000
);
const CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.ROUTING_CACHE_TTL_MS) || 120000, 0),
  600000
);
const CACHE_MAX = 100;

/** @type {Map<string, { value: unknown; expiresAt: number }>} */
const routeCache = new Map();

function cacheGet(key) {
  if (CACHE_TTL_MS <= 0) return null;
  const entry = routeCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    routeCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (CACHE_TTL_MS <= 0) return;
  if (routeCache.size >= CACHE_MAX) {
    const first = routeCache.keys().next().value;
    if (first) routeCache.delete(first);
  }
  routeCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function parseCoord(raw, name) {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new AppError(`${name} must be a valid number`, 400);
  }
  return n;
}

function validateLatLng(lat, lng) {
  if (lat < -90 || lat > 90) throw new AppError("Latitude out of range", 400);
  if (lng < -180 || lng > 180) throw new AppError("Longitude out of range", 400);
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} sec`;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"}`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} hr ${rem} min` : `${hrs} hr`;
}

function boundsFromCoords(coords) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return {
    sw: { lat: minLat, lng: minLng },
    ne: { lat: maxLat, lng: maxLng },
  };
}

function mapOrsResponse(data) {
  const feature = data?.features?.[0];
  if (!feature) {
    throw new AppError("No route found", 404);
  }
  const props = feature.properties || {};
  const summary = props.summary || {};
  const geometry = feature.geometry;
  const coordinates = geometry?.coordinates;
  if (!coordinates?.length || geometry?.type !== "LineString") {
    throw new AppError("Route geometry missing", 502);
  }
  const durationSeconds = Number(summary.duration ?? props.duration ?? 0);
  const distanceMeters = Number(summary.distance ?? props.distance ?? 0);
  return {
    durationText: formatDuration(durationSeconds),
    durationSeconds,
    distanceMeters,
    geometry: {
      type: "LineString",
      coordinates,
    },
    bounds: boundsFromCoords(coordinates),
  };
}

async function getDirections(originLat, originLng, destLat, destLng) {
  validateLatLng(originLat, originLng);
  validateLatLng(destLat, destLng);

  const cacheKey = `${originLat.toFixed(5)},${originLng.toFixed(5)}->${destLat.toFixed(5)},${destLng.toFixed(5)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const apiKey = String(process.env.OPENROUTESERVICE_API_KEY || "").trim();
  if (!apiKey) {
    throw new AppError("Routing service is not configured", 503);
  }

  const body = {
    coordinates: [
      [originLng, originLat],
      [destLng, destLat],
    ],
  };

  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: {
      Accept: "application/geo+json",
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AppError(text || `Routing error (${res.status})`, res.status >= 500 ? 502 : 400);
  }

  const data = await res.json();
  const payload = mapOrsResponse(data);
  cacheSet(cacheKey, payload);
  return payload;
}

module.exports = {
  getDirections,
  parseCoord,
};
