import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTheme } from 'next-themes';
import { getMapStyleUrl } from '@/lib/map/mapStyles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';

type MapLibreModule = typeof import('maplibre-gl');

type MapProviderContextValue = {
  isLoaded: boolean;
  loadError: Error | undefined;
  maplibre: MapLibreModule['default'] | null;
  styleUrl: string;
};

const defaultValue: MapProviderContextValue = {
  isLoaded: false,
  loadError: undefined,
  maplibre: null,
  styleUrl: getMapStyleUrl(false),
};

const MapProviderContext = createContext<MapProviderContextValue>(defaultValue);

export function useMapProvider() {
  return useContext(MapProviderContext);
}

export function MapProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = resolvedTheme === 'dark' || (resolvedTheme == null && prefersDark);
  const styleUrl = useMemo(() => getMapStyleUrl(isDark), [isDark]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | undefined>();
  const [maplibre, setMaplibre] = useState<MapLibreModule['default'] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);
    setLoadError(undefined);

    void import('maplibre-gl')
      .then((mod) => {
        if (cancelled) return;
        setMaplibre(mod.default);
        setIsLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err : new Error('Failed to load map library'));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      isLoaded,
      loadError,
      maplibre,
      styleUrl,
    }),
    [isLoaded, loadError, maplibre, styleUrl]
  );

  return <MapProviderContext.Provider value={value}>{children}</MapProviderContext.Provider>;
}

export function useMapStyleUrl() {
  return useMapProvider().styleUrl;
}

export function useMapLibre() {
  return useMapProvider();
}
