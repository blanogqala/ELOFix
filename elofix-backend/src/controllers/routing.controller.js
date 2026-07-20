const AppError = require("../utils/AppError");
const routingService = require("../services/routing.service");

async function directions(req, res) {
  const originLat = routingService.parseCoord(req.query?.originLat, "originLat");
  const originLng = routingService.parseCoord(req.query?.originLng, "originLng");
  const destLat = routingService.parseCoord(req.query?.destLat, "destLat");
  const destLng = routingService.parseCoord(req.query?.destLng, "destLng");

  const result = await routingService.getDirections(originLat, originLng, destLat, destLng);
  res.json({ success: true, ...result });
}

module.exports = {
  directions,
};
