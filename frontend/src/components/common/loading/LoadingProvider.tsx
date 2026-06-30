import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { LoadingOverlay } from './LoadingOverlay';

type LoadingContextValue = {
  loading: boolean;
  message: string | null;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
};

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [loadingCount, setLoadingCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<string | null>(null);

  const startLoading = useCallback((nextMessage?: string) => {
    if (nextMessage) {
      messageRef.current = nextMessage;
      setMessage(nextMessage);
    } else if (!messageRef.current) {
      setMessage(null);
    }
    setLoadingCount((count) => count + 1);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingCount((count) => {
      const next = Math.max(0, count - 1);
      if (next === 0) {
        messageRef.current = null;
        setMessage(null);
      }
      return next;
    });
  }, []);

  const value = useMemo<LoadingContextValue>(
    () => ({
      loading: loadingCount > 0,
      message,
      startLoading,
      stopLoading,
    }),
    [loadingCount, message, startLoading, stopLoading],
  );

  return (
    <LoadingContext.Provider value={value}>
      {children}
      <LoadingOverlay open={loadingCount > 0} message={message} />
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}
