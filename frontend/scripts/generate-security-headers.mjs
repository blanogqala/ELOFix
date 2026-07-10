/**
 * Build-time Netlify _headers generator.
 * Reads VITE_* env vars (from .env / Netlify build env) and writes public/_headers.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, '..');
const outPath = join(frontendRoot, 'public', '_headers');

/** Load .env and .env.production if present (simple KEY=VALUE parser). */
function loadEnvFiles() {
  const merged = { ...process.env };
  for (const name of ['.env', '.env.production', '.env.local']) {
    try {
      const raw = readFileSync(join(frontendRoot, name), 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!(key in merged)) merged[key] = val;
      }
    } catch {
      /* optional file */
    }
  }
  return merged;
}

function originFromUrl(url) {
  try {
    return new URL(String(url).trim()).origin;
  } catch {
    return null;
  }
}

function wssOriginFromHttpOrigin(origin) {
  if (!origin) return null;
  if (origin.startsWith('https://')) return origin.replace(/^https:/, 'wss:');
  if (origin.startsWith('http://')) return origin.replace(/^http:/, 'ws:');
  return null;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildCsp(env) {
  const apiOrigin =
    originFromUrl(env.VITE_API_ORIGIN) ||
    originFromUrl(env.VITE_API_BASE_URL?.replace(/\/api\/?$/, '')) ||
    'http://localhost:5000';

  const socketOrigin = originFromUrl(env.VITE_SOCKET_URL) || apiOrigin;
  const wssOrigin = wssOriginFromHttpOrigin(socketOrigin);

  const firebaseEnabled =
    String(env.VITE_USE_FIREBASE || '').toLowerCase() === 'true' &&
    Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID);

  const scriptSrc = uniq([
    "'self'",
    'https://maps.googleapis.com',
    firebaseEnabled ? 'https://apis.google.com' : null,
    firebaseEnabled ? 'https://www.gstatic.com' : null,
  ]);

  const connectSrc = uniq([
    "'self'",
    apiOrigin,
    wssOrigin,
    'https://maps.googleapis.com',
    'https://*.googleapis.com',
    'https://m1.openfpcdn.io',
    firebaseEnabled ? 'https://identitytoolkit.googleapis.com' : null,
    firebaseEnabled ? 'https://securetoken.googleapis.com' : null,
    firebaseEnabled ? 'https://www.googleapis.com' : null,
    firebaseEnabled && env.VITE_FIREBASE_AUTH_DOMAIN
      ? `https://${env.VITE_FIREBASE_AUTH_DOMAIN}`
      : null,
  ]);

  const imgSrc = uniq([
    "'self'",
    'data:',
    'blob:',
    apiOrigin,
    'https://*.googleapis.com',
    'https://*.gstatic.com',
    'https://*.googleusercontent.com',
    'https://lh3.googleusercontent.com',
  ]);

  const frameSrc = uniq([
    firebaseEnabled ? 'https://accounts.google.com' : null,
    firebaseEnabled ? 'https://*.firebaseapp.com' : null,
  ]);

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `connect-src ${connectSrc.join(' ')}`,
    frameSrc.length ? `frame-src ${frameSrc.join(' ')}` : `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://sandbox.payfast.co.za https://www.payfast.co.za`,
    `object-src 'none'`,
  ];

  const isProd = String(env.NODE_ENV || '').toLowerCase() === 'production';
  if (isProd) {
    directives.push('upgrade-insecure-requests');
    directives.push('block-all-mixed-content');
  }

  return directives.join('; ');
}

function buildHeadersFile(env) {
  const csp = buildCsp(env);
  return `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), camera=(self), microphone=(), payment=(self)
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Content-Security-Policy: ${csp}
`;
}

const env = loadEnvFiles();
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buildHeadersFile(env), 'utf8');
console.log(`[security-headers] Wrote ${outPath}`);
