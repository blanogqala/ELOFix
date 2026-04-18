/** API server origin (files are served at /uploads on this host) */
export const API_ORIGIN =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN) ||
  'http://localhost:5000';

/**
 * Turn stored paths like `/uploads/...` into absolute URLs for <img src>.
 */
export function resolveUploadUrl(path: string | undefined | null): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${p}`;
}
