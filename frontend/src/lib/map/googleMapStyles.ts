/** Subtle styling — clean roads, reduced POI clutter (Google Maps–like). */
export const ELOFIX_MAP_STYLES = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8eaed' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c8d7f0' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
] as const;

export const ELOFIX_MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  clickableIcons: false,
  gestureHandling: 'greedy',
  styles: [...ELOFIX_MAP_STYLES],
} satisfies google.maps.MapOptions;
