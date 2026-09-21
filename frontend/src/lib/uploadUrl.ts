function resolveApiOrigin(): string {
  const explicit =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN
      ? String(import.meta.env.VITE_API_ORIGIN).trim()
      : '';
  if (explicit) return explicit.replace(/\/$/, '');

  const apiBase =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).trim()
      : '';
  if (apiBase) {
    try {
      return new URL(apiBase).origin;
    } catch {
      /* fall through */
    }
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    throw new Error(
      'Production frontend is missing VITE_API_ORIGIN / VITE_API_BASE_URL. This build should have been rejected at compile time.'
    );
  }
  return 'http://localhost:5000';
}

/** API server origin (files are served at /uploads on this host) */
export const API_ORIGIN = resolveApiOrigin();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isApiFilePath(pathname: string): boolean {
  return pathname.startsWith('/uploads/') || pathname.startsWith('/api/files/');
}

function toApiFilePath(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (isApiFilePath(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (isApiFilePath(parsed.pathname)) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* not an absolute URL */
  }
  return null;
}

/**
 * Turn stored paths like `/uploads/...` or `/api/files/{id}` into <img src> URLs.
 * SPA-origin copies of those paths are rewritten onto the API origin so Vite :8080
 * does not try to serve index.html as a JPEG.
 */
export function resolveUploadUrl(path: string | undefined | null): string {
  if (!path) return '';
  if (path.startsWith('data:')) return path;

  const filePath = toApiFilePath(path);
  if (filePath) {
    return `${API_ORIGIN}${filePath}`;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const trimmed = path.trim();
  if (UUID_RE.test(trimmed)) {
    return `${API_ORIGIN}/api/files/${trimmed}`;
  }

  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${p}`;
}
