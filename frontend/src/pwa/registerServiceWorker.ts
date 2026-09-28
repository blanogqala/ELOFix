export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}
