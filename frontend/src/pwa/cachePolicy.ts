/** Cache name shared by the service worker. Bump when precached files change. */
export const CACHE_NAME = 'elofix-static-v1';

/**
 * Safe static files precached so the offline screen and icons work without a network.
 * Do not add HTML shells for account, job, auth, or payment routes.
 */
export const PRECACHE_URLS = [
  '/offline.html',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/icon-maskable-192.png',
  '/pwa/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/site.webmanifest',
] as const;

const SENSITIVE_EXACT = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/unauthorized',
  '/user/payments',
  '/admin/payments',
]);

const SENSITIVE_QUERY_KEYS = ['exchange', 'access_token', 'id_token', 'refresh_token', 'token'];

const HASHED_ASSET_EXT = /\.(?:js|css|mjs|woff2?|png|svg|webp|gif|ico|jpe?g)$/i;

function hasSensitiveQuery(url: URL): boolean {
  for (const key of SENSITIVE_QUERY_KEYS) {
    if (url.searchParams.has(key)) return true;
  }
  return false;
}

/**
 * Requests that must never be stored: API data, uploads, auth, and payment pages.
 * Job and account pages are also omitted from the static-asset cache by isCacheableStaticAsset.
 */
export function isSensitiveUrl(url: URL): boolean {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/api' || path.startsWith('/api/')) return true;
  if (path === '/uploads' || path.startsWith('/uploads/')) return true;
  if (path === '/payments' || path.startsWith('/payments/')) return true;
  if (path === '/auth' || path.startsWith('/auth/')) return true;
  if (path === '/user/payments' || path.startsWith('/user/payments/')) return true;
  if (path === '/admin/payments' || path.startsWith('/admin/payments/')) return true;
  if (SENSITIVE_EXACT.has(path)) return true;
  return hasSensitiveQuery(url);
}

export function isPrecachedAsset(url: URL): boolean {
  if (url.search) return false;
  return (PRECACHE_URLS as readonly string[]).includes(url.pathname);
}

/** Vite content-hashed files under /assets/ only. Never API, HTML, or credentialed URLs. */
export function isCacheableStaticAsset(url: URL): boolean {
  if (url.search) return false;
  if (isSensitiveUrl(url)) return false;
  if (!url.pathname.startsWith('/assets/')) return false;
  return HASHED_ASSET_EXT.test(url.pathname);
}
