import apiClient from '@/api/client';

export interface ReverseGeocodeResult {
  fullAddress: string;
  address: string;
  street?: string;
  city: string;
  suburb?: string;
  area?: string;
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
