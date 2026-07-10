/**
 * Allowed browser origins for CORS and Socket.IO.
 * Production: FRONTEND_URL (required for OAuth). Development: localhost dev servers.
 */
function parseOriginList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function getAllowedOrigins() {
  const origins = new Set(parseOriginList(process.env.FRONTEND_URL));
  parseOriginList(process.env.FRONTEND_BASE_URL).forEach((o) => origins.add(o));
  parseOriginList(process.env.CORS_ALLOWED_ORIGINS).forEach((o) => origins.add(o));

  const nodeEnv = String(process.env.NODE_ENV || 'development');
  if (nodeEnv !== 'production') {
    origins.add('http://localhost:8080');
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:8080');
    origins.add('http://127.0.0.1:5173');
  }

  return [...origins];
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  const normalized = String(origin).trim().replace(/\/$/, '');
  return allowedOrigins.some((allowed) => allowed === normalized);
}

function createCorsOriginChecker(allowedOrigins) {
  return function corsOrigin(origin, callback) {
    if (isOriginAllowed(origin, allowedOrigins)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  };
}

module.exports = {
  getAllowedOrigins,
  isOriginAllowed,
  createCorsOriginChecker,
};
