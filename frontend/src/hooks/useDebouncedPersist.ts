import { useEffect, useRef } from 'react';

/**
 * Debounced side-effect for persisting serializable form state (e.g. sessionStorage).
 */
export function useDebouncedPersist(
  persist: () => void,
  deps: readonly unknown[],
  debounceMs = 400,
  enabled = true
): void {
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      persistRef.current();
    }, debounceMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies explicit deps
  }, [...deps, debounceMs, enabled]);
}
