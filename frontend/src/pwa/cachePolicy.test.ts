import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isCacheableStaticAsset, isPrecachedAsset, isSensitiveUrl } from './cachePolicy';

const swSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'sw.ts'), 'utf8');

function url(path: string) {
  return new URL(path, 'https://www.elofix.co.za');
}

describe('service worker cache policy', () => {
  it('treats API, uploads, auth, and payment URLs as sensitive', () => {
    expect(isSensitiveUrl(url('/api/jobs/1'))).toBe(true);
    expect(isSensitiveUrl(url('/api/payments/intents/pi-1/confirm-return'))).toBe(true);
    expect(isSensitiveUrl(url('/uploads/job-photo.jpg'))).toBe(true);
    expect(isSensitiveUrl(url('/payments/return?intentId=pi-1'))).toBe(true);
    expect(isSensitiveUrl(url('/payments/cancel?intentId=pi-1'))).toBe(true);
    expect(isSensitiveUrl(url('/auth/google/callback?exchange=secret'))).toBe(true);
    expect(isSensitiveUrl(url('/login'))).toBe(true);
    expect(isSensitiveUrl(url('/user/payments'))).toBe(true);
    expect(isSensitiveUrl(url('/admin/payments/job-1'))).toBe(true);
    expect(isSensitiveUrl(url('/track/abc?token=secret'))).toBe(true);
  });

  it('does not treat public pages or job routes as cacheable static assets', () => {
    expect(isSensitiveUrl(url('/'))).toBe(false);
    expect(isSensitiveUrl(url('/user/jobs/job-1'))).toBe(false);
    expect(isCacheableStaticAsset(url('/user/jobs/job-1'))).toBe(false);
    expect(isCacheableStaticAsset(url('/provider/jobs/job-1'))).toBe(false);
    expect(isCacheableStaticAsset(url('/hero-background.png'))).toBe(false);
    expect(isCacheableStaticAsset(url('/sw.js'))).toBe(false);
    expect(isCacheableStaticAsset(url('/assets/index-abc.js?token=secret'))).toBe(false);
  });

  it('caches only hashed build assets and the precache list', () => {
    expect(isCacheableStaticAsset(url('/assets/index-Abc123.js'))).toBe(true);
    expect(isCacheableStaticAsset(url('/assets/index-Abc123.css'))).toBe(true);
    expect(isPrecachedAsset(url('/offline.html'))).toBe(true);
    expect(isPrecachedAsset(url('/pwa/icon-512.png'))).toBe(true);
    expect(isPrecachedAsset(url('/offline.html?intentId=pi-1'))).toBe(false);
  });

  it('never writes navigation responses into the cache', () => {
    const navigation = swSource.slice(
      swSource.indexOf('async function networkNavigation'),
      swSource.indexOf('async function cacheFirstStatic'),
    );
    expect(navigation).toContain('fetch(request)');
    expect(navigation).toContain("cache.match('/offline.html')");
    expect(navigation).not.toContain('cache.put');
    expect(swSource).toContain("request.method !== 'GET'");
    expect(swSource).toContain('isSensitiveUrl(url)');
    expect(swSource).not.toContain('/api/');
  });
});
