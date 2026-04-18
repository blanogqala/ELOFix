// Safe PostMessage Utility
// Prevents cross-origin errors in Lovable preview environment

const ALLOWED_ORIGINS = [
  'https://lovable.dev',
  'https://lovable.app',
];

export const isLovablePreview = typeof window !== 'undefined' && 
  window.location.hostname.includes('lovable.app');

export const isAllowedOrigin = (origin: string): boolean => {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.lovable.app')) return true;
  if (origin.endsWith('.lovable.dev')) return true;
  return false;
};

export const safePostMessage = (
  target: Window | null,
  message: unknown,
  targetOrigin: string
): void => {
  // Skip if in Lovable preview and trying to post to lovable.dev
  if (isLovablePreview && targetOrigin === 'https://lovable.dev') {
    console.debug('[safePostMessage] Skipped posting to lovable.dev from preview');
    return;
  }

  // Only post if target exists and origin is valid
  if (target && (targetOrigin === '*' || isAllowedOrigin(targetOrigin))) {
    try {
      target.postMessage(message, targetOrigin);
    } catch (error) {
      console.debug('[safePostMessage] Failed to post message:', error);
    }
  }
};

export const addSafeMessageListener = (
  handler: (event: MessageEvent) => void,
  allowedOrigins?: string[]
): (() => void) => {
  const safeHandler = (event: MessageEvent) => {
    const origins = allowedOrigins || ALLOWED_ORIGINS;
    
    // Validate origin
    if (!isAllowedOrigin(event.origin) && !origins.some(o => event.origin.includes(o))) {
      return; // Silently ignore unknown origins
    }

    try {
      handler(event);
    } catch (error) {
      console.debug('[safeMessageListener] Handler error:', error);
    }
  };

  window.addEventListener('message', safeHandler);
  return () => window.removeEventListener('message', safeHandler);
};
