export type ExternalNavDestination = {
  lat?: number;
  lng?: number;
  address?: string;
};

/** OpenStreetMap directions URL (no API key). */
export function buildExternalDirectionsUrl(dest: ExternalNavDestination): string | null {
  if (
    dest.lat != null &&
    dest.lng != null &&
    Number.isFinite(dest.lat) &&
    Number.isFinite(dest.lng)
  ) {
    return `https://www.openstreetmap.org/directions?to=${dest.lat}%2C${dest.lng}`;
  }
  const address = dest.address?.trim();
  if (address) {
    return `https://www.openstreetmap.org/directions?to=${encodeURIComponent(address)}`;
  }
  return null;
}

/** OpenStreetMap search URL for an address label. */
export function buildExternalSearchUrl(address: string): string | null {
  const q = address.trim();
  if (!q) return null;
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;
}
