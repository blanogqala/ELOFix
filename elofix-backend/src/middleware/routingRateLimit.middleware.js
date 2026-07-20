const AppError = require("../utils/AppError");

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;

/** @type {Map<string, { count: number; resetAt: number }>} */
const buckets = new Map();

function clientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function routingRateLimit(req, res, next) {
  const key = clientKey(req);
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    return next(new AppError("Too many routing requests. Please try again shortly.", 429));
  }
  return next();
}

module.exports = { routingRateLimit };
