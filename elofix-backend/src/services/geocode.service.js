const AppError = require("../utils/AppError");

const UA = process.env.GEOCODE_USER_AGENT || "ELOFix/1.0";

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

function mapOpenCage(data, lat, lng) {
  const first = data?.results?.[0];
  if (!first) {
    throw new AppError("No address found for these coordinates", 404);
  }
  const c = first.components || {};
  const city = String(pickCity(c) || c.state || c.region || c.country || "").trim();
  const suburb = String(pickSuburb(c) || "").trim();
  const road = [c.house_number, c.road].filter(Boolean).join(" ").trim();
  const address =
    String(first.formatted || road || suburb || city || `${lat}, ${lng}`).trim() || `${lat}, ${lng}`;

  return {
    address,
    city: city || suburb || address.split(",")[0]?.trim() || "",
    area: suburb || undefined,
    suburb: suburb || undefined,
    coordinates: { lat, lng },
  };
}

function mapNominatim(data, lat, lng) {
  const a = data?.address || {};
  const city = String(pickCity(a) || a.state || a.region || a.country || "").trim();
  const suburb = String(pickSuburb(a) || "").trim();
  const road = [a.house_number, a.road].filter(Boolean).join(" ").trim();
  const display = String(data?.display_name || "").trim();
  const address = road || display || `${lat}, ${lng}`;

  return {
    address: display || address,
    city: city || suburb || (display ? display.split(",")[1]?.trim() : "") || "",
    area: suburb || undefined,
    suburb: suburb || undefined,
    coordinates: { lat, lng },
  };
}

async function reverseGeocode(lat, lng) {
  const key = process.env.OPENCAGE_API_KEY;
  if (key && String(key).trim()) {
    const q = encodeURIComponent(`${lat},${lng}`);
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${q}&key=${encodeURIComponent(key.trim())}&no_annotations=1`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new AppError(`Geocoding service error (${res.status})`, 502);
    }
    const data = await res.json();
    if (data.status?.code && data.status.code !== 200) {
      throw new AppError(data.status.message || "Geocoding failed", 502);
    }
    return mapOpenCage(data, lat, lng);
  }

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
    },
  });
  if (!res.ok) {
    throw new AppError(`Geocoding service error (${res.status})`, 502);
  }
  const data = await res.json();
  if (data.error) {
    throw new AppError(String(data.error), 502);
  }
  return mapNominatim(data, lat, lng);
}

module.exports = {
  reverseGeocode,
};
