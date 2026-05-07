const AppError = require("../utils/AppError");

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
    coordinates: { lat, lng },
  };
}

function mapNominatim(data, lat, lng) {
  const a = data?.address || {};
  const { city, suburb, area } = deriveCityAndSuburb(a);
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

module.exports = {
  reverseGeocode,
};
