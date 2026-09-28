import { describe, expect, it } from 'vitest';
import { resolvePostLoginPath, splitInternalPath } from './postLoginRedirect';

describe('post-login paths for installed-app launches', () => {
  it('keeps payment return and cancel query strings for the roles that can open them', () => {
    expect(resolvePostLoginPath('user', '/payments/return', '/user/dashboard', '?intentId=pi-1')).toBe(
      '/payments/return?intentId=pi-1',
    );
    expect(resolvePostLoginPath('provider', '/payments/return?intentId=pi-2')).toBe('/payments/return?intentId=pi-2');
    expect(resolvePostLoginPath('user', '/payments/cancel', '/user/dashboard', '?intentId=pi-1')).toBe(
      '/payments/cancel?intentId=pi-1',
    );
    expect(resolvePostLoginPath('provider', '/payments/cancel', '/provider/dashboard', '?intentId=pi-1')).toBe(
      '/provider/dashboard',
    );
    expect(resolvePostLoginPath('admin', '/payments/return', '/admin/dashboard', '?intentId=pi-1')).toBe(
      '/admin/dashboard',
    );
  });

  it('restores same-role deep links and drops other roles, details, and external URLs', () => {
    expect(resolvePostLoginPath('user', '/user/request/service', '/user/dashboard', '?category=delivery')).toBe(
      '/user/request/service?category=delivery',
    );
    expect(resolvePostLoginPath('provider', '/provider/jobs')).toBe('/provider/jobs');
    expect(resolvePostLoginPath('user', '/provider/jobs')).toBe('/user/dashboard');
    expect(resolvePostLoginPath('user', '/user/jobs/job-1')).toBe('/user/dashboard');
    expect(resolvePostLoginPath('provider', '/provider/jobs/job-1')).toBe('/provider/dashboard');
    expect(resolvePostLoginPath('user', 'https://evil.example/payments/return?intentId=pi-1')).toBe('/user/dashboard');
    expect(splitInternalPath('//evil.example')).toEqual({ pathname: '/', search: '', hash: '' });
    expect(resolvePostLoginPath('supplier', '/')).toBe('/supplier/dashboard');
    expect(resolvePostLoginPath('branch_staff', '/supplier/orders')).toBe('/supplier/orders');
  });
});
