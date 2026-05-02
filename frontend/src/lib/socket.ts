import { io } from 'socket.io-client';
import { getCurrentSession } from '@/lib/api/auth';

/** Match default in `src/api/client.js` so dev server (e.g. :8080) still talks to API :5000 when env is unset. */
const DEFAULT_API_BASE = 'http://localhost:5000/api';

function getSocketUrl(): string {
  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (explicitSocketUrl && String(explicitSocketUrl).trim()) {
    return String(explicitSocketUrl).trim();
  }

  const apiBaseUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL && String(import.meta.env.VITE_API_BASE_URL).trim()) ||
    DEFAULT_API_BASE;

  try {
    return new URL(String(apiBaseUrl)).origin;
  } catch {
    /* fall through */
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'http://localhost:5000';
}

const SOCKET_URL = getSocketUrl();

export const socket = io(SOCKET_URL, {
  autoConnect: false,
});

/** Aligns JWT with Socket.IO and opens the connection (idempotent). */
export function ensureSocketAuthAndConnect(): void {
  if (typeof window === 'undefined') return;
  const session = getCurrentSession();
  if (session?.token) {
    socket.auth = { token: session.token };
  }
  if (!socket.connected) {
    socket.connect();
  }
}
