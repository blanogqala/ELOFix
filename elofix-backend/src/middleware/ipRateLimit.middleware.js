const AppError = require("../utils/AppError");

function clientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function isLoopbackKey(key) {
  const ip = String(key || "")
    .replace(/^::ffff:/i, "")
    .toLowerCase();
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

function envFlagTrue(name) {
  const v = String(process.env[name] || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Production always rate-limits. Local/CI e2e may bypass (never honor this in production). */
function shouldBypassAuthRateLimit(req) {
  if (process.env.NODE_ENV === "production") return false;
  if (envFlagTrue("ELOFIX_AUTH_RATE_LIMIT_DISABLED") || envFlagTrue("ELOFIX_E2E_FULL_STACK")) {
    return true;
  }
  return isLoopbackKey(clientKey(req));
}

function createIpRateLimiter({ windowMs, max, message, allowNonProductionBypass = false }) {
  /** @type {Map<string, { count: number; resetAt: number }>} */
  const buckets = new Map();

  function middleware(req, res, next) {
    if (allowNonProductionBypass && shouldBypassAuthRateLimit(req)) {
      return next();
    }
    const key = clientKey(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return next(new AppError(message || "Too many requests. Please try again shortly.", 429));
    }
    return next();
  }

  middleware.reset = () => buckets.clear();
  return middleware;
}

const FIFTEEN_MIN = 15 * 60 * 1000;

const authLoginRateLimit = createIpRateLimiter({
  windowMs: FIFTEEN_MIN,
  max: 5,
  message: "Too many login attempts. Please try again shortly.",
  allowNonProductionBypass: true,
});

const authRegisterRateLimit = createIpRateLimiter({
  windowMs: FIFTEEN_MIN,
  max: 10,
  message: "Too many registration attempts. Please try again shortly.",
  allowNonProductionBypass: true,
});

const authPasswordRateLimit = createIpRateLimiter({
  windowMs: FIFTEEN_MIN,
  max: 5,
  message: "Too many password reset attempts. Please try again shortly.",
  allowNonProductionBypass: true,
});

const authGoogleStartRateLimit = createIpRateLimiter({
  windowMs: FIFTEEN_MIN,
  max: 20,
  message: "Too many sign-in attempts. Please try again shortly.",
  allowNonProductionBypass: true,
});

const authGoogleExchangeRateLimit = createIpRateLimiter({
  windowMs: FIFTEEN_MIN,
  max: 5,
  message: "Too many sign-in attempts. Please try again shortly.",
  allowNonProductionBypass: true,
});

const contactRateLimit = createIpRateLimiter({
  windowMs: FIFTEEN_MIN,
  max: 5,
  message: "Too many messages. Please try again shortly.",
  allowNonProductionBypass: true,
});

function resetAuthRateLimits() {
  authLoginRateLimit.reset();
  authRegisterRateLimit.reset();
  authPasswordRateLimit.reset();
  authGoogleStartRateLimit.reset();
  authGoogleExchangeRateLimit.reset();
  contactRateLimit.reset();
}

module.exports = {
  createIpRateLimiter,
  clientKey,
  shouldBypassAuthRateLimit,
  authLoginRateLimit,
  authRegisterRateLimit,
  authPasswordRateLimit,
  authGoogleStartRateLimit,
  authGoogleExchangeRateLimit,
  contactRateLimit,
  resetAuthRateLimits,
};
