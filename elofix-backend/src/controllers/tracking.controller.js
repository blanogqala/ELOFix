const trackingService = require("../services/tracking.service");

async function getByTrackingId(req, res) {
  const token = req.query?.token ?? req.query?.access_token;
  const data = await trackingService.getPublicTrackingView(req.params.trackingId, token);
  res.json({ success: true, ...data });
}

async function postUpdate(req, res) {
  const { trackingId, lat, lng, token } = req.body || {};
  if (!trackingId) {
    return res.status(400).json({ success: false, message: "trackingId required" });
  }
  await trackingService.saveLocationByTrackingId(trackingId, lat, lng, token);
  trackingService.trackingLog("tracking_http_location_update", { trackingId });
  res.json({ success: true });
}

async function getLatestForOrder(req, res) {
  const data = await trackingService.getLatestLocationForOrder(
    req.params.orderId,
    req.user.userId,
    req.user.role
  );
  res.json({ success: true, ...data });
}

module.exports = {
  getByTrackingId,
  postUpdate,
  getLatestForOrder,
};
