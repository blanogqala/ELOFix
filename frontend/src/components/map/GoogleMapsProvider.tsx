import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';

const LOADER_ID = 'elofix-google-maps';

type GoogleMapsContextValue = {
  isLoaded: boolean;
  loadError: Error | undefined;
  authFailed: boolean;
  apiKey: string;
};

const defaultValue: GoogleMapsContextValue = {
  isLoaded: false,
  loadError: undefined,
  authFailed: false,
  apiKey: '',
};

const GoogleMapsContext = createContext<GoogleMapsContextValue>(defaultValue);

export function useGoogleMapsContext() {
  return useContext(GoogleMapsContext);
}

function readMapsApiKey(): string {
  const raw = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GOOGLE_MAPS_API_KEY : '';
  return String(raw || '').trim();
}

function GoogleMapsLoader({ apiKey, children }: { apiKey: string; children: ReactNode }) {
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    const prev = window.gm_authFailure;
    window.gm_authFailure = () => setAuthFailed(true);
    return () => {
      if (prev) window.gm_authFailure = prev;
      else delete window.gm_authFailure;
    };
  }, []);

  const { isLoaded, loadError } = useJsApiLoader({
    id: LOADER_ID,
    googleMapsApiKey: apiKey,
    preventGoogleFontsLoading: true,
    version: 'weekly',
  });

  const value = useMemo(
    () => ({
      isLoaded: isLoaded && !authFailed,
      loadError,
      authFailed,
      apiKey,
    }),
    [apiKey, isLoaded, loadError, authFailed]
  );

  return <GoogleMapsContext.Provider value={value}>{children}</GoogleMapsContext.Provider>;
}

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const apiKey = readMapsApiKey();

  if (!apiKey) {
    return (
      <GoogleMapsContext.Provider
        value={{
          isLoaded: false,
          loadError: new Error('Missing VITE_GOOGLE_MAPS_API_KEY'),
          authFailed: false,
          apiKey: '',
        }}
      >
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return <GoogleMapsLoader apiKey={apiKey}>{children}</GoogleMapsLoader>;
}

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}
