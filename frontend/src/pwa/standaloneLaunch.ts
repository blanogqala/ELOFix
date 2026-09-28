import { getDefaultDashboardPath } from '@/lib/postLoginRedirect';

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Home-screen launches open start_url "/".
 * Send a signed-in person to their role dashboard only for that exact launch URL.
 * Deep links, payment return, and in-app visits to other paths are left alone.
 */
export function standaloneHomeDashboardPath(input: {
  pathname: string;
  search: string;
  hash: string;
  isAuthenticated: boolean;
  role?: string | null;
}): string | null {
  if (!input.isAuthenticated || !input.role) return null;
  if (input.pathname !== '/' || input.search || input.hash) return null;
  return getDefaultDashboardPath(input.role);
}
