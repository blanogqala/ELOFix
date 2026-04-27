import { io } from 'socket.io-client';

function getSocketUrl(): string {
  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (explicitSocketUrl && String(explicitSocketUrl).trim()) {
    return String(explicitSocketUrl).trim();
  }

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (apiBaseUrl && String(apiBaseUrl).trim()) {
    try {
      return new URL(String(apiBaseUrl)).origin;
    } catch {
      // Fall through to runtime origin/local fallback.
    }
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
