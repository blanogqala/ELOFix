const AppError = require("../utils/AppError");
const geocodeService = require("../services/geocode.service");

async function reverse(req, res) {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new AppError("lat and lng must be valid numbers", 400);
  }
  const result = await geocodeService.reverseGeocode(lat, lng);
  res.json({ success: true, ...result });
}

module.exports = {
  reverse,
};
