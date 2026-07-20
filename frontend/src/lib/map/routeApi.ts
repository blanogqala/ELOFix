import apiClient from '@/api/client';

export type RouteBounds = {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
};

export type RouteLineString = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type RouteResponse = {
  durationText: string;
  durationSeconds: number;
  distanceMeters: number;
  geometry: RouteLineString;
  bounds: RouteBounds;
};

export async function fetchDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResponse> {
  const { data } = await apiClient.get<{ success: boolean } & RouteResponse>('/routing/directions', {
    params: {
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: destination.lat,
      destLng: destination.lng,
    },
  });
  if (!data?.success) {
    throw new Error('Routing failed');
  }
  return data;
}
