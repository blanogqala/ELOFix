import apiClient from '@/api/client';

export interface ReverseGeocodeResult {
  address: string;
  city: string;
  area?: string;
  suburb?: string;
  coordinates: { lat: number; lng: number };
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const { data } = await apiClient.post<{ success: boolean } & ReverseGeocodeResult>('/geocode/reverse', {
    lat,
    lng,
  });
  if (!data?.success) throw new Error('Geocoding failed');
  return {
    address: data.address,
    city: data.city,
    area: data.area,
    suburb: data.suburb,
    coordinates: data.coordinates,
  };
}
