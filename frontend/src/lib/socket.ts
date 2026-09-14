import { io } from 'socket.io-client';
import { getCurrentSession } from '@/lib/api/auth';

/** Match default in `src/api/client.js` so dev server (e.g. :8080) still talks to API :5000 when env is unset. */
const DEFAULT_API_BASE = 'http://localhost:5000/api';
const SOCKET_PATH = '/socket.io';

function isLocalhostUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(value);
  }
}

function isProductionBuild(): boolean {
  return Boolean(import.meta.env?.PROD) || String(import.meta.env?.MODE || '') === 'production';
}

function trimOrigin(value: string): string {
  return String(value || '').trim().replace(/\/$/, '');
}

/**
 * Socket.IO origin precedence:
 * 1. VITE_SOCKET_URL when explicitly supplied (and not localhost in production)
 * 2. API origin derived from VITE_API_BASE_URL
 * 3. localhost only for local development
 *
 * Production never falls back to the browser page origin (Netlify / elofix.co.za)
 * and never silently connects to localhost.
 */
export function resolveSocketUrl(opts: {
  prod: boolean;
  socketUrl?: string;
  apiBaseUrl?: string;
}): string {
  const prod = Boolean(opts.prod);
  const explicitSocketUrl = opts.socketUrl;
  if (explicitSocketUrl && String(explicitSocketUrl).trim()) {
    const explicit = trimOrigin(String(explicitSocketUrl));
    if (!(prod && isLocalhostUrl(explicit))) {
      try {
        return new URL(explicit).origin;
      } catch {
        return explicit;
      }
    }
  }

  const apiBaseUrl = (opts.apiBaseUrl && String(opts.apiBaseUrl).trim()) || (prod ? '' : DEFAULT_API_BASE);

  if (apiBaseUrl) {
    try {
      const origin = new URL(String(apiBaseUrl)).origin;
      if (!(prod && isLocalhostUrl(origin))) {
        return origin;
      }
    } catch {
      /* fall through */
    }
  }

  if (prod) {
    return '';
  }

  return 'http://localhost:5000';
}

export function getSocketUrl(): string {
  return resolveSocketUrl({
    prod: isProductionBuild(),
    socketUrl: import.meta.env?.VITE_SOCKET_URL,
    apiBaseUrl: import.meta.env?.VITE_API_BASE_URL,
  });
}

const SOCKET_URL = getSocketUrl();

if (isProductionBuild() && !SOCKET_URL) {
  console.error(
    '[socket] production socket origin unresolved; refusing localhost and page-origin fallback. Set VITE_API_BASE_URL (Render API) or optional VITE_SOCKET_URL.',
  );
}

/** Shared singleton — hooks and AuthContext must reuse this instance. */
export const socket = io(SOCKET_URL || 'http://127.0.0.1:0', {
  autoConnect: false,
  path: SOCKET_PATH,
  transports: ['polling', 'websocket'],
  withCredentials: false,
});

function currentSessionToken(): string {
  const session = getCurrentSession();
  return session?.token ? String(session.token) : '';
}

/** Apply the current session JWT to handshake auth. Never puts the token in the URL. */
export function applyCurrentSocketAuth(): boolean {
  const token = currentSessionToken();
  if (!token) {
    socket.auth = {};
    return false;
  }
  socket.auth = { token };
  return true;
}

let reconnectAuthBound = false;
function bindReconnectAuth(): void {
  if (reconnectAuthBound) return;
  reconnectAuthBound = true;
  socket.io.on('reconnect_attempt', () => {
    applyCurrentSocketAuth();
  });
}

bindReconnectAuth();

/** Aligns JWT with Socket.IO and opens the connection (idempotent). */
export function ensureSocketAuthAndConnect(): void {
  if (typeof window === 'undefined') return;
  if (isProductionBuild() && !getSocketUrl()) return;

  const token = currentSessionToken();
  const prev = (socket.auth as { token?: string } | undefined)?.token;
  if (token) {
    socket.auth = { token };
    if (socket.connected && prev !== token) {
      socket.disconnect();
      socket.connect();
      return;
    }
  } else if (prev) {
    clearSocketAuthAndDisconnect();
    return;
  }
  if (!socket.connected) {
    socket.connect();
  }
}

/** Logout / missing session: drop auth and disconnect so an old JWT cannot linger. */
export function clearSocketAuthAndDisconnect(): void {
  socket.auth = {};
  if (socket.connected || (socket as { active?: boolean }).active) {
    socket.disconnect();
  }
}

export { SOCKET_PATH };
