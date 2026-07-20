/** ELOFix brand-aligned map tokens (match index.css HSL palette). */
export const MAP_BRAND = {
  /** hsl(213 80% 15%) — primary navy */
  primary: '#082849',
  /** hsl(213 70% 25%) — primary mid */
  primaryMid: '#0f3d6e',
  /** hsl(213 70% 60%) — dark-mode primary */
  primaryLight: '#5b9fdb',
  /** hsl(33 100% 55%) — accent orange */
  accent: '#ff9619',
  /** Delivery destination — distinct but on-brand coral */
  delivery: '#e85d4c',
  /** Route halo for contrast on light tiles */
  routeHalo: '#ffffff',
} as const;

export type MapStylePreset = 'streets' | 'basic' | 'bright';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const MAPTILER_PRESETS: Record<MapStylePreset, { light: string; dark: string }> = {
  /** Best default: readable roads, POI labels, polished for delivery tracking */
  streets: { light: 'streets-v2', dark: 'streets-v2-dark' },
  /** Cleaner/minimal — less visual noise when route + markers are overlaid */
  basic: { light: 'basic-v2', dark: 'basic-v2-dark' },
  /** Lighter/friendlier — good for customer-facing pages in light mode */
  bright: { light: 'bright-v2', dark: 'streets-v2-dark' },
};

function readEnv(key: string): string {
  const raw = typeof import.meta !== 'undefined' ? import.meta.env?.[key] : '';
  return String(raw || '').trim();
}

function readMapTilerKey(): string {
  return readEnv('VITE_MAPTILER_API_KEY');
}

function readStylePreset(): MapStylePreset {
  const raw = readEnv('VITE_MAP_STYLE').toLowerCase();
  if (raw === 'basic' || raw === 'bright' || raw === 'streets') return raw;
  return 'streets';
}

function readTileProvider(): 'maptiler' | 'openfreemap' {
  const provider = readEnv('VITE_TILE_PROVIDER').toLowerCase();
  if (provider === 'openfreemap') return 'openfreemap';
  if (readMapTilerKey()) return 'maptiler';
  return 'openfreemap';
}

/** Resolve MapLibre style URL — MapTiler when configured, otherwise OpenFreeMap. */
export function getMapStyleUrl(isDark: boolean): string {
  const provider = readTileProvider();
  if (provider === 'openfreemap') return OPENFREEMAP_STYLE;

  const key = readMapTilerKey();
  if (!key) return OPENFREEMAP_STYLE;

  const preset = MAPTILER_PRESETS[readStylePreset()];
  const variant = isDark ? preset.dark : preset.light;
  return `https://api.maptiler.com/maps/${variant}/style.json?key=${encodeURIComponent(key)}`;
}

export const MAP_DEFAULT_CENTER = { lat: -33.9249, lng: 18.4241 } as const;

export const MAP_DEFAULT_ZOOM = 12;

export const MAP_DRIVER_ZOOM = 14;

export const MAP_BOUNDS_PADDING = 56;

/** Driving route — brand navy, reads clearly on MapTiler streets/basic tiles */
export const ROUTE_LINE_COLOR = MAP_BRAND.primary;

export const ROUTE_LINE_WIDTH = 5;

export const ROUTE_LINE_OPACITY = 0.92;

/** Optional outer stroke on route for light basemaps */
export const ROUTE_HALO_WIDTH = 1.5;

export const ROUTE_HALO_COLOR = MAP_BRAND.routeHalo;

export const ROUTE_HALO_OPACITY = 0.85;
