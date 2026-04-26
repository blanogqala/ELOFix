/** API server origin (files are served at /uploads on this host) */
export const API_ORIGIN =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN) ||
  'http://localhost:5000';

/**
 * Turn stored paths like `/uploads/...` into absolute URLs for <img src>.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveUploadUrl(path: string | undefined | null): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const trimmed = path.trim();
  if (UUID_RE.test(trimmed)) {
    return `${API_ORIGIN}/api/files/${trimmed}`;
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${p}`;
}
