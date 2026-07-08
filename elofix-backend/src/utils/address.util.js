function normalizeAddressToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Join address parts while dropping exact duplicates (case-insensitive). */
function joinUniqueAddressParts(...parts) {
  const seen = new Set();
  const result = [];
  for (const raw of parts) {
    const part = String(raw ?? "").trim();
    if (!part) continue;
    const key = normalizeAddressToken(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(part);
  }
  return result.join(", ");
}

/** Remove repeated comma-separated segments from a stored address string. */
function dedupeAddressString(address) {
  const segments = String(address || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return joinUniqueAddressParts(...segments);
}

function jobSiteAddressFromRow(job) {
  const loc = job?.locationDetails;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const joined = joinUniqueAddressParts(loc.address, loc.suburb, loc.area, loc.city);
    if (joined) return joined;
  }
  const l = job?.location;
  if (l && String(l).trim() && String(l).trim() !== "UNKNOWN") return String(l).trim();
  return "";
}

function jobSiteLocationFromRow(job) {
  const loc = job?.locationDetails;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const coords =
      loc.coordinates &&
      typeof loc.coordinates === "object" &&
      Number.isFinite(Number(loc.coordinates.lat)) &&
      Number.isFinite(Number(loc.coordinates.lng))
        ? { lat: Number(loc.coordinates.lat), lng: Number(loc.coordinates.lng) }
        : Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))
          ? { lat: Number(loc.lat), lng: Number(loc.lng) }
          : undefined;
    const streetAddress = loc.address ? String(loc.address).trim() : jobSiteAddressFromRow(job);
    return {
      address: streetAddress,
      city: loc.city ? String(loc.city) : undefined,
      area: loc.area ? String(loc.area) : undefined,
      suburb: loc.suburb ? String(loc.suburb) : undefined,
      coordinates: coords,
    };
  }
  return { address: jobSiteAddressFromRow(job) };
}

function sanitizeGeoPointForResponse(point) {
  if (!point || typeof point !== "object") return point;
  return {
    ...point,
    address: dedupeAddressString(point.address),
  };
}

module.exports = {
  joinUniqueAddressParts,
  dedupeAddressString,
  jobSiteAddressFromRow,
  jobSiteLocationFromRow,
  sanitizeGeoPointForResponse,
};
