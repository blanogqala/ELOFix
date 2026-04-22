/**
 * Resolves the PostgreSQL connection URL for Prisma CLI and the runtime pg Pool.
 *
 * - NODE_ENV === "production": process.env.DATABASE_URL exactly as set.
 * - NODE_ENV === "development": LOCAL_DATABASE_URL if set, else DATABASE_URL. sslmode=disable is applied
 *   only for local hosts (localhost / 127.0.0.1 / ::1 / *.localhost) or when DATABASE_SSL_DISABLE=true.
 *   Remote URLs (Neon, Supabase, RDS, …) are left unchanged so TLS keeps working.
 * - Any other NODE_ENV (unset, test, staging, CI): DATABASE_URL unchanged (so migrate deploy / hosted DB stay safe).
 *
 * Never assigns to process.env.DATABASE_URL.
 */

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

function getUrlHostname(urlString) {
  try {
    const normalized = String(urlString).replace(/^postgresql:/i, "postgres:");
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
}

function isLocalPostgresHost(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.endsWith(".localhost") ||
    h === "host.docker.internal"
  );
}

function ensureSslDisabledInUrl(urlString) {
  const s = String(urlString).trim();
  if (/[?&]sslmode=/i.test(s)) {
    return s.replace(/([?&])sslmode=[^&]*/i, "$1sslmode=disable");
  }
  return s.includes("?") ? `${s}&sslmode=disable` : `${s}?sslmode=disable`;
}

/**
 * In development only: turn off TLS for typical local Postgres. Never strip TLS from remote URLs
 * unless DATABASE_SSL_DISABLE is explicitly set.
 */
function applyDevelopmentSslRules(urlString) {
  const s = String(urlString).trim();
  const forceDisable =
    process.env.DATABASE_SSL_DISABLE === "1" || process.env.DATABASE_SSL_DISABLE === "true";

  if (forceDisable) {
    return ensureSslDisabledInUrl(s);
  }

  const host = getUrlHostname(s);
  if (host && isLocalPostgresHost(host)) {
    return ensureSslDisabledInUrl(s);
  }

  return s;
}

function resolveDatabaseUrl() {
  const primary = process.env.DATABASE_URL;
  if (!primary || !String(primary).trim()) {
    throw new Error("DATABASE_URL is not set");
  }

  const trimmed = String(primary).trim();

  if (isProduction() || !isDevelopment()) {
    return trimmed;
  }

  const local = process.env.LOCAL_DATABASE_URL;
  if (local && String(local).trim()) {
    return applyDevelopmentSslRules(String(local).trim());
  }

  return applyDevelopmentSslRules(trimmed);
}

module.exports = {
  resolveDatabaseUrl,
  isProduction,
  isDevelopment,
  isLocalPostgresHost,
  getUrlHostname,
};
