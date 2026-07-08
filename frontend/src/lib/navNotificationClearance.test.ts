import { describe, expect, it } from 'vitest';
import { resolveNavClearancePath } from './navNotificationClearance';

describe('resolveNavClearancePath', () => {
  it('resolves admin provider subpaths to /admin/providers', () => {
    expect(resolveNavClearancePath('/admin/providers', 'admin')).toBe('/admin/providers');
    expect(resolveNavClearancePath('/admin/providers/abc-123', 'admin')).toBe('/admin/providers');
  });

  it('resolves provider requests for provider role', () => {
    expect(resolveNavClearancePath('/provider/requests', 'provider')).toBe('/provider/requests');
    expect(resolveNavClearancePath('/provider/requests/job-1', 'provider')).toBe('/provider/requests');
  });

  it('resolves user jobs for customer role', () => {
    expect(resolveNavClearancePath('/user/jobs', 'user')).toBe('/user/jobs');
    expect(resolveNavClearancePath('/user/jobs/job-1', 'user')).toBe('/user/jobs');
  });

  it('returns null for unrelated paths', () => {
    expect(resolveNavClearancePath('/admin/dashboard', 'admin')).toBeNull();
    expect(resolveNavClearancePath('/admin/providers', 'user')).toBeNull();
    expect(resolveNavClearancePath('/provider/jobs', 'user')).toBeNull();
  });

  it('resolves provider profile for provider role', () => {
    expect(resolveNavClearancePath('/provider/profile', 'provider')).toBe('/provider/profile');
  });
});
