import apiClient from '@/api/client';

export interface ReverseGeocodeResult {
  fullAddress: string;
  address: string;
  street?: string;
  city: string;
  suburb?: string;
  area?: string;
  metro?: string;
  coordinates: { lat: number; lng: number };
}

export interface ForwardGeocodeResult {
  lat: number;
  lng: number;
  coordinates: { lat: number; lng: number };
  label: string;
}

export interface GeocodeSuggestion {
  label: string;
  lat: number;
  lng: number;
  coordinates: { lat: number; lng: number };
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const { data } = await apiClient.get<{ success: boolean } & ReverseGeocodeResult>('/geocode/reverse', {
    params: { lat, lng },
  });
  if (!data?.success) {
    throw new Error('Geocoding failed');
  }
  return data;
}

export async function forwardGeocode(query: string): Promise<ForwardGeocodeResult> {
  const { data } = await apiClient.get<{ success: boolean } & ForwardGeocodeResult>('/geocode/forward', {
    params: { q: query },
  });
  if (!data?.success) {
    throw new Error('Geocoding failed');
  }
  return data;
}

export async function searchAddresses(query: string): Promise<GeocodeSuggestion[]> {
  const { data } = await apiClient.get<{ success: boolean; suggestions: GeocodeSuggestion[] }>(
    '/geocode/search',
    { params: { q: query } }
  );
  if (!data?.success) {
    throw new Error('Address search failed');
  }
  return data.suggestions ?? [];
}
