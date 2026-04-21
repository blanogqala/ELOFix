const AppError = require("../utils/AppError");
const { parseIdempotencyKey } = require("../utils/idempotency");
const { financialRequestFingerprint } = require("../utils/requestFingerprint");

function normalizedPath(req) {
  return String(req.originalUrl || `${req.baseUrl || ""}${req.path || ""}`).split("?")[0];
}

/**
 * After express.json: sets req.financialRequestHash and req.financialIdempotencyRoute
 */
function attachFinancialRequestFingerprint(req, res, next) {
  try {
    const path = normalizedPath(req);
    req.financialIdempotencyRoute = path;
    req.financialRequestHash = financialRequestFingerprint(req.method, path, req.body);
    next();
  } catch (e) {
    next(e);
  }
}

function requireIdempotencyKey(req, res, next) {
  const key = parseIdempotencyKey(req);
  if (!key) {
    return next(new AppError("Idempotency-Key header required", 400));
  }
  req.financialIdempotencyKey = key;
  next();
}

module.exports = {
  attachFinancialRequestFingerprint,
  requireIdempotencyKey,
  normalizedPath,
};
