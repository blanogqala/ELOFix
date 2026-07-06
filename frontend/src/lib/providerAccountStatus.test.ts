import { describe, expect, it } from 'vitest';
import {
  canAdminActOnProviderApplication,
  canAdminUnrejectProvider,
  getProviderAccountStatus,
  getProviderAccountStatusLabel,
  isProviderApplicationRejected,
  isProviderAwaitingApproval,
} from '@/lib/providerAccountStatus';

const base = {
  approved: false,
  blocked: false,
  profileCompleted: true,
  reviewSubmittedAt: '2026-07-01T10:00:00.000Z',
};

describe('providerAccountStatus', () => {
  it('returns pending for complete submitted unapproved providers', () => {
    expect(getProviderAccountStatus(base)).toBe('pending');
    expect(isProviderAwaitingApproval(base)).toBe(true);
  });

  it('returns rejected when rejection fields are set', () => {
    const rejected = {
      ...base,
      rejectionReason: 'Incomplete documents',
      rejectedAt: '2026-07-03T12:00:00.000Z',
    };
    expect(getProviderAccountStatus(rejected)).toBe('rejected');
    expect(isProviderApplicationRejected(rejected)).toBe(true);
    expect(isProviderAwaitingApproval(rejected)).toBe(false);
  });

  it('returns incomplete when profile is not complete', () => {
    const incomplete = { ...base, profileCompleted: false };
    expect(getProviderAccountStatus(incomplete)).toBe('incomplete');
    expect(isProviderAwaitingApproval(incomplete)).toBe(false);
  });

  it('returns incomplete when complete but not submitted for review', () => {
    const notSubmitted = { ...base, reviewSubmittedAt: undefined };
    expect(getProviderAccountStatus(notSubmitted)).toBe('incomplete');
    expect(canAdminActOnProviderApplication(notSubmitted)).toBe(false);
  });

  it('returns approved and blocked with correct priority', () => {
    expect(getProviderAccountStatus({ ...base, approved: true })).toBe('approved');
    expect(getProviderAccountStatus({ ...base, blocked: true })).toBe('blocked');
    expect(
      getProviderAccountStatus({
        ...base,
        blocked: true,
        rejectionReason: 'test',
      })
    ).toBe('blocked');
  });

  it('maps status labels', () => {
    expect(getProviderAccountStatusLabel('rejected')).toBe('Rejected');
    expect(getProviderAccountStatusLabel('incomplete')).toBe('Incomplete');
  });

  it('allows admin unreject only for rejected unapproved unblocked providers', () => {
    const rejected = {
      ...base,
      rejectionReason: 'Incomplete documents',
      rejectedAt: '2026-07-03T12:00:00.000Z',
    };
    expect(canAdminUnrejectProvider(rejected)).toBe(true);
    expect(canAdminUnrejectProvider({ ...rejected, approved: true })).toBe(false);
    expect(canAdminUnrejectProvider({ ...rejected, blocked: true })).toBe(false);
    expect(canAdminUnrejectProvider(base)).toBe(false);
  });
});
