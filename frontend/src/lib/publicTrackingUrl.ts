/** Public customer/driver page: `/track/:trackingId?token=`. */
export function buildPublicTrackingUrl(trackingId: string, token?: string | null): string {
  if (typeof window === 'undefined') return '';
  const q = token && token.length > 0 ? `?token=${encodeURIComponent(token)}` : '';
  return `${window.location.origin}/track/${encodeURIComponent(trackingId)}${q}`;
}
