const AppError = require("../utils/AppError");

const SWEEP_EVERY_REQUESTS = 32;
const MAX_BUCKETS = 10_000;
const SWEEP_INTERVAL_MS = 60_000;

function envFlagTrue(name) {
  const v = String(process.env[name] || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function normalizeIp(value) {
  return String(value || "")
    .replace(/^::ffff:/i, "")
    .toLowerCase()
    .trim();
}

/**
 * Use Express req.ip only. Do not read X-Forwarded-For here.
 * When `app.set('trust proxy', N)` is set (production default: 1 for Render),
 * Express derives req.ip from the trusted hop. Without trust proxy, req.ip is
 * the TCP peer and client-supplied forwarded headers are ignored.
 */
function clientKey(req) {
  const fromExpress = normalizeIp(req?.ip);
  if (fromExpress) return fromExpress;
  const socket = normalizeIp(req?.socket?.remoteAddress);
  if (socket) return socket;
  return "unknown";
}

function isLoopbackKey(key) {
  const ip = normalizeIp(key);
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

/** Production always rate-limits. Local/CI e2e may bypass (never honor this in production). */
function shouldBypassAuthRateLimit(req) {
  if (process.env.NODE_ENV === "production") return false;
  if (envFlagTrue("ELOFIX_AUTH_RATE_LIMIT_DISABLED") || envFlagTrue("ELOFIX_E2E_FULL_STACK")) {
    return true;
  }
  return isLoopbackKey(clientKey(req));
}

function sweepExpiredBuckets(buckets, now = Date.now()) {
  for (const [key, bucket] of buckets) {
    if (!bucket || now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
  if (buckets.size <= MAX_BUCKETS) return;
  const overflow = buckets.size - MAX_BUCKETS;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function createIpRateLimiter({ windowMs, max, message, allowNonProductionBypass = false }) {
  /** @type {Map<string, { count: number; resetAt: number }>} */
  const buckets = new Map();
  let requestsSinceSweep = 0;

  const timer = setInterval(() => {
    sweepExpiredBuckets(buckets);
  }, SWEEP_INTERVAL_MS);
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  function maybeSweep(now) {
    requestsSinceSweep += 1;
    if (requestsSinceSweep < SWEEP_EVERY_REQUESTS && buckets.size < MAX_BUCKETS) {
      return;
    }
    requestsSinceSweep = 0;
    sweepExpiredBuckets(buckets, now);
  }

  function middleware(req, res, next) {
    if (allowNonProductionBypass && shouldBypassAuthRateLimit(req)) {
      return next();
    }
    const key = clientKey(req);
    const now = Date.now();
    maybeSweep(now);
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

  middleware.reset = () => {
    buckets.clear();
    requestsSinceSweep = 0;
  };
  middleware.getBucketCount = () => buckets.size;
  middleware.sweepExpired = (now = Date.now()) => sweepExpiredBuckets(buckets, now);
  middleware.stop = () => clearInterval(timer);
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

/**
 * Render (and typical TLS reverse proxies) append one trusted hop.
 * Override with TRUST_PROXY=false | 1 | 2 | ...
 */
function resolveTrustProxySetting(env = process.env) {
  const raw = String(env.TRUST_PROXY || "").trim();
  if (raw === "false" || raw === "0") return false;
  if (raw === "true") return 1;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
    return raw;
  }
  if (String(env.NODE_ENV || "").toLowerCase() === "production") return 1;
  return false;
}

function applyTrustProxy(app, env = process.env) {
  app.set("trust proxy", resolveTrustProxySetting(env));
  return app.get("trust proxy");
}

module.exports = {
  createIpRateLimiter,
  clientKey,
  shouldBypassAuthRateLimit,
  sweepExpiredBuckets,
  resolveTrustProxySetting,
  applyTrustProxy,
  authLoginRateLimit,
  authRegisterRateLimit,
  authPasswordRateLimit,
  authGoogleStartRateLimit,
  authGoogleExchangeRateLimit,
  contactRateLimit,
  resetAuthRateLimits,
};
