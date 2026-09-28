import { describe, expect, it } from 'vitest';
import { isIosInstallSurface, readInstallDismissed, shouldOfferInstall, writeInstallDismissed } from './installPrompt';
import { standaloneHomeDashboardPath } from './standaloneLaunch';

describe('install guidance', () => {
  it('offers Android when the browser can prompt, and iPhone instructions otherwise', () => {
    expect(
      shouldOfferInstall({
        dismissed: false,
        standalone: false,
        ios: false,
        hasInstallPrompt: true,
        pathname: '/',
      }),
    ).toBe('android');
    expect(
      shouldOfferInstall({
        dismissed: false,
        standalone: false,
        ios: true,
        hasInstallPrompt: false,
        pathname: '/user/new-request',
      }),
    ).toBe('ios');
    expect(isIosInstallSurface('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true);
    expect(isIosInstallSurface('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5)).toBe(false);
  });

  it('stays hidden after dismiss, in standalone mode, and on payment or auth routes', () => {
    const storage = new Map<string, string>();
    const memory = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    expect(readInstallDismissed(memory)).toBe(false);
    writeInstallDismissed(memory);
    expect(readInstallDismissed(memory)).toBe(true);
    expect(
      shouldOfferInstall({
        dismissed: true,
        standalone: false,
        ios: true,
        hasInstallPrompt: true,
        pathname: '/',
      }),
    ).toBeNull();
    expect(
      shouldOfferInstall({
        dismissed: false,
        standalone: true,
        ios: true,
        hasInstallPrompt: false,
        pathname: '/',
      }),
    ).toBeNull();
    expect(
      shouldOfferInstall({
        dismissed: false,
        standalone: false,
        ios: true,
        hasInstallPrompt: true,
        pathname: '/payments/return',
      }),
    ).toBeNull();
    expect(
      shouldOfferInstall({
        dismissed: false,
        standalone: false,
        ios: true,
        hasInstallPrompt: false,
        pathname: '/auth/google/callback',
      }),
    ).toBeNull();
  });
});

describe('standalone home launch', () => {
  it('sends a signed-in home-screen launch to the role dashboard', () => {
    expect(
      standaloneHomeDashboardPath({
        pathname: '/',
        search: '',
        hash: '',
        isAuthenticated: true,
        role: 'provider',
      }),
    ).toBe('/provider/dashboard');
    expect(
      standaloneHomeDashboardPath({
        pathname: '/',
        search: '',
        hash: '',
        isAuthenticated: true,
        role: 'supplier',
      }),
    ).toBe('/supplier/dashboard');
    expect(
      standaloneHomeDashboardPath({
        pathname: '/',
        search: '',
        hash: '',
        isAuthenticated: true,
        role: 'admin',
      }),
    ).toBe('/admin/dashboard');
  });

  it('leaves deep links, payment return, and signed-out launches on their URL', () => {
    expect(
      standaloneHomeDashboardPath({
        pathname: '/user/jobs/job-1',
        search: '',
        hash: '',
        isAuthenticated: true,
        role: 'user',
      }),
    ).toBeNull();
    expect(
      standaloneHomeDashboardPath({
        pathname: '/payments/return',
        search: '?intentId=pi-1',
        hash: '',
        isAuthenticated: true,
        role: 'user',
      }),
    ).toBeNull();
    expect(
      standaloneHomeDashboardPath({
        pathname: '/',
        search: '',
        hash: '',
        isAuthenticated: false,
        role: null,
      }),
    ).toBeNull();
    expect(
      standaloneHomeDashboardPath({
        pathname: '/',
        search: '?source=share',
        hash: '',
        isAuthenticated: true,
        role: 'user',
      }),
    ).toBeNull();
  });
});
