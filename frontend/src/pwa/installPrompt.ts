export const INSTALL_DISMISS_KEY = 'elofix.pwa.installDismissed';

export type InstallOffer = 'android' | 'ios';

export function readInstallDismissed(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(INSTALL_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeInstallDismissed(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(INSTALL_DISMISS_KEY, '1');
  } catch {
    /* private mode can reject storage; the banner still hides for this page view */
  }
}

export function isIosInstallSurface(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  const ua = userAgent || '';
  if (/android/i.test(ua)) return false;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

/** Payment return and OAuth must stay clear of the install banner. */
export function isQuietInstallPath(pathname: string): boolean {
  return (
    pathname === '/payments/return' ||
    pathname === '/payments/cancel' ||
    pathname.startsWith('/auth/')
  );
}

export function shouldOfferInstall(input: {
  dismissed: boolean;
  standalone: boolean;
  ios: boolean;
  hasInstallPrompt: boolean;
  pathname: string;
}): InstallOffer | null {
  if (input.dismissed || input.standalone) return null;
  if (isQuietInstallPath(input.pathname)) return null;
  if (input.hasInstallPrompt) return 'android';
  if (input.ios) return 'ios';
  return null;
}
