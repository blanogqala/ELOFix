/**
 * Allowed browser origins for CORS and Socket.IO.
 * Production: FRONTEND_URL / FRONTEND_BASE_URL / CORS_ALLOWED_ORIGINS.
 * Development: localhost Vite / Playwright origins are added automatically.
 *
 * Origins are exact (trailing slash stripped). Wildcards are never accepted.
 */

function parseOriginList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isLocalhostHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

function isWildcardOrigin(value) {
  const s = String(value || "").trim();
  return s === "*" || s.includes("*");
}

/**
 * Exact http(s) origin only. Rejects wildcards, credentials-in-URL, paths, and non-http(s).
 * @returns {string|null} normalized origin or null if invalid
 */
function sanitizeOrigin(value) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw || isWildcardOrigin(raw)) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (u.search || u.hash) return null;
    if (u.pathname && u.pathname !== "/") return null;
    return u.origin;
  } catch {
    return null;
  }
}

function readOriginEnv(envObj = process.env) {
  const origins = new Set();
  parseOriginList(envObj.FRONTEND_URL).forEach((o) => origins.add(o));
  parseOriginList(envObj.FRONTEND_BASE_URL).forEach((o) => origins.add(o));
  parseOriginList(envObj.CORS_ALLOWED_ORIGINS).forEach((o) => origins.add(o));
  return [...origins];
}

function getAllowedOrigins(envObj = process.env) {
  const origins = new Set();
  for (const raw of readOriginEnv(envObj)) {
    const clean = sanitizeOrigin(raw);
    if (clean) origins.add(clean);
  }

  const nodeEnv = String(envObj.NODE_ENV || "development");
  if (nodeEnv !== "production") {
    origins.add("http://localhost:8080");
    origins.add("http://localhost:8081"); // Playwright e2e (playwright.config.ts)
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:8080");
    origins.add("http://127.0.0.1:8081");
    origins.add("http://127.0.0.1:5173");
  }

  return [...origins];
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  const normalized = sanitizeOrigin(origin) || String(origin).trim().replace(/\/$/, "");
  return allowedOrigins.some((allowed) => allowed === normalized);
}

function createCorsOriginChecker(allowedOrigins) {
  return function corsOrigin(origin, callback) {
    if (isOriginAllowed(origin, allowedOrigins)) {
      callback(null, true);
      return;
    }
    // Reject without throwing — cors Error callbacks become HTTP 500.
    callback(null, false);
  };
}

/**
 * Live CORS origin callback so Express and Socket.IO share getAllowedOrigins().
 */
function corsOriginCallback(origin, callback) {
  createCorsOriginChecker(getAllowedOrigins())(origin, callback);
}

function isPublicHttpsOrigin(origin) {
  const clean = sanitizeOrigin(origin);
  if (!clean) return false;
  try {
    const u = new URL(clean);
    if (u.protocol !== "https:") return false;
    if (isLocalhostHostname(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Production must have at least one explicit public https frontend origin.
 * Development / test never fail this check (localhost remains allowed).
 */
function getCorsConfigReadiness(envObj = process.env) {
  const nodeEnv = String(envObj.NODE_ENV || "development").toLowerCase();
  if (nodeEnv !== "production") {
    return { ok: true, reason: "non_production" };
  }

  const configured = readOriginEnv(envObj);
  if (configured.length === 0) {
    return { ok: false, reason: "missing_frontend_origins" };
  }

  const allowed = getAllowedOrigins(envObj);
  const publicHttps = allowed.filter(isPublicHttpsOrigin);
  if (publicHttps.length === 0) {
    return { ok: false, reason: "no_public_https_origin" };
  }
  return { ok: true, reason: "ok" };
}

module.exports = {
  parseOriginList,
  sanitizeOrigin,
  getAllowedOrigins,
  isOriginAllowed,
  createCorsOriginChecker,
  corsOriginCallback,
  getCorsConfigReadiness,
  isPublicHttpsOrigin,
  isWildcardOrigin,
};
