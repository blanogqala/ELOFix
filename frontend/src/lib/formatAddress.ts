import type { DeliveryGeoPoint } from '@/types';

function normalizeAddressToken(value: string): string {
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Join address parts while dropping exact duplicates (case-insensitive). */
export function joinUniqueAddressParts(...parts: Array<string | undefined | null>): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of parts) {
    const part = String(raw ?? '').trim();
    if (!part) continue;
    const key = normalizeAddressToken(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(part);
  }
  return result.join(', ');
}

export function dedupeAddressString(address?: string | null): string {
  const segments = String(address ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return joinUniqueAddressParts(...segments);
}

export function formatGeoPointLabel(point?: DeliveryGeoPoint | null): string {
  if (!point) return '—';
  const addressSegments = String(point.address ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const parts = joinUniqueAddressParts(point.label, ...addressSegments, point.suburb, point.area, point.city);
  return parts || '—';
}

export function formatDeliveryPointLabel(point: DeliveryGeoPoint): string {
  const addressSegments = String(point.address ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (addressSegments.length === 0 && !point.suburb && !point.area && !point.city) return '—';
  return joinUniqueAddressParts(...addressSegments, point.suburb, point.area, point.city) || '—';
}
