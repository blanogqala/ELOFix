import apiClient from '@/api/client';

export interface ReverseGeocodeResult {
  fullAddress: string;
  address: string;
  city: string;
  area?: string;
  suburb?: string;
  coordinates: { lat: number; lng: number };
}

const REVERSE_TIMEOUT_MS = 30000;

/**
 * Reverse geocode via backend `GET /geocode/reverse` (OpenCage + Nominatim fallback server-side).
 * API key stays on the server.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const { data } = await apiClient.get<
    { success: boolean } & Partial<ReverseGeocodeResult> & { address?: string; fullAddress?: string }
  >('/geocode/reverse', {
    params: { lat, lng },
    timeout: REVERSE_TIMEOUT_MS,
  });
  if (!data?.success) throw new Error('Geocoding failed');
  const address = String(data.fullAddress || data.address || '').trim();
  if (!address) throw new Error('Geocoding failed');
  return {
    fullAddress: address,
    address,
    city: String(data.city || '').trim(),
    area: data.area,
    suburb: data.suburb,
    coordinates: data.coordinates || { lat, lng },
  };
}
