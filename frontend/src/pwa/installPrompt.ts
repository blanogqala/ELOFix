/** iOS uses its browser Share menu to add a web app to the Home Screen. */
export function isIosInstallSurface(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  const ua = userAgent || '';
  if (/android/i.test(ua)) return false;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}
