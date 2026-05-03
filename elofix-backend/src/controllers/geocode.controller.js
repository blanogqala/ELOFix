const AppError = require("../utils/AppError");
const geocodeService = require("../services/geocode.service");

function parseCoord(raw) {
  if (raw === undefined || raw === null || raw === "") return NaN;
  const n = Number(raw);
  return n;
}

async function reverse(req, res) {
  const lat = parseCoord(req.query?.lat ?? req.body?.lat);
  const lng = parseCoord(req.query?.lng ?? req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new AppError("lat and lng must be valid numbers", 400);
  }
  const result = await geocodeService.reverseGeocode(lat, lng);
  res.json({ success: true, ...result });
}

module.exports = {
  reverse,
};
