/**
 * Shared production frontend URL validation (CSP generator + Vite plugin + tests).
 */

export function originFromUrl(url) {
  try {
    return new URL(String(url).trim()).origin;
  } catch {
    return null;
  }
}

export function isLocalhostHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
}

export function isLocalhostUrl(url) {
  try {
    return isLocalhostHostname(new URL(String(url).trim()).hostname);
  } catch {
    return false;
  }
}

export function resolveApiOrigin(env) {
  return (
    originFromUrl(env.VITE_API_ORIGIN) ||
    originFromUrl(String(env.VITE_API_BASE_URL || "").replace(/\/api\/?$/, ""))
  );
}

export function isProductionFrontendBuild(env, mode) {
  if (String(mode || "").toLowerCase() === "development") return false;
  if (String(mode || "").toLowerCase() === "production") return true;
  return String(env.NODE_ENV || "").toLowerCase() === "production";
}

/**
 * Development may use localhost defaults.
 * Production/staging builds must have an explicit non-localhost HTTPS API origin.
 */
export function assertProductionFrontendConfig(env = process.env, options = {}) {
  const production = isProductionFrontendBuild(env, options.mode);
  const resolved = resolveApiOrigin(env);
  if (!production) {
    return { ok: true, production: false, apiOrigin: resolved || "http://localhost:5000" };
  }
  if (!resolved) {
    throw new Error(
      "Production frontend build requires VITE_API_ORIGIN or VITE_API_BASE_URL (public API origin). Localhost defaults are not allowed."
    );
  }
  if (isLocalhostUrl(resolved)) {
    throw new Error(
      `Production frontend build cannot use a localhost API origin (${resolved}). Set VITE_API_ORIGIN / VITE_API_BASE_URL to the deployed HTTPS API.`
    );
  }
  if (!resolved.startsWith("https://")) {
    throw new Error(
      `Production frontend build requires an HTTPS API origin. Received: ${resolved}`
    );
  }
  return { ok: true, production: true, apiOrigin: resolved };
}
