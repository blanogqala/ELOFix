import apiClient from '@/api/client';

function toApiFilePath(reference: string): string {
  const raw = String(reference || '').trim();
  if (!raw) {
    throw new Error('File URL is missing');
  }

  try {
    const parsed = new URL(raw);
    const idx = parsed.pathname.indexOf('/api/files/');
    if (idx >= 0) {
      return parsed.pathname.slice(idx + '/api'.length);
    }
  } catch {
    // Relative paths are handled below.
  }

  if (raw.startsWith('/api/files/')) {
    return raw.slice('/api'.length);
  }
  if (raw.startsWith('/files/')) {
    return raw;
  }
  return `/files/${encodeURIComponent(raw.replace(/^\/+/, ''))}`;
}

export async function fetchStoredFileBlob(reference: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(toApiFilePath(reference), {
    responseType: 'blob',
  });
  return data;
}

export function openBlobInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
