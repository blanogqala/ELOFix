import { describe, it, expect } from 'vitest';
import {
  getAdminCaseViewPath,
  getPayerBadgeKind,
  getPayerBadgeLabel,
} from './adminJobCaseResolution';
import type { AdminJobCaseSummary } from '@/lib/api/adminDisputes';

function makeSummary(overrides: Partial<AdminJobCaseSummary> = {}): AdminJobCaseSummary {
  return {
    disputeId: 'disp-1',
    caseKind: 'dispute',
    status: 'RESOLVED',
    action: 'RELEASE_FUNDS',
    actionLabel: 'Release remaining funds to provider',
    notes: null,
    resolvedAt: null,
    payerRole: 'customer',
    payerSummary: 'Customer must pay remaining balance to provider.',
    ...overrides,
  };
}

describe('getAdminCaseViewPath', () => {
  it('routes to /admin/disputes for dispute caseKind', () => {
    const summary = makeSummary({ caseKind: 'dispute', disputeId: 'abc-123' });
    expect(getAdminCaseViewPath(summary)).toBe('/admin/disputes/abc-123');
  });

  it('routes to /admin/cancellations for cancellation caseKind', () => {
    const summary = makeSummary({ caseKind: 'cancellation', disputeId: 'xyz-456' });
    expect(getAdminCaseViewPath(summary)).toBe('/admin/cancellations/xyz-456');
  });
});

describe('getPayerBadgeKind', () => {
  it('returns customer_owes when payerRole is customer', () => {
    expect(getPayerBadgeKind(makeSummary({ payerRole: 'customer' }))).toBe('customer_owes');
  });

  it('returns provider_owes when payerRole is provider', () => {
    expect(getPayerBadgeKind(makeSummary({ payerRole: 'provider' }))).toBe('provider_owes');
  });

  it('returns resolved for FULL_REFUND with payerRole none', () => {
    expect(getPayerBadgeKind(makeSummary({ payerRole: 'none', action: 'FULL_REFUND' }))).toBe('resolved');
  });

  it('returns resolved for PARTIAL_REFUND with payerRole none', () => {
    expect(getPayerBadgeKind(makeSummary({ payerRole: 'none', action: 'PARTIAL_REFUND' }))).toBe('resolved');
  });

  it('returns neutral for CLOSE_CASE', () => {
    expect(getPayerBadgeKind(makeSummary({ payerRole: 'none', action: 'CLOSE_CASE' }))).toBe('neutral');
  });
});

describe('getPayerBadgeLabel', () => {
  it('labels customer_owes correctly', () => {
    expect(getPayerBadgeLabel(makeSummary({ payerRole: 'customer' }))).toBe('Customer must pay');
  });

  it('labels provider_owes correctly', () => {
    expect(getPayerBadgeLabel(makeSummary({ payerRole: 'provider' }))).toBe('Provider must repay');
  });

  it('labels refund issued correctly', () => {
    expect(getPayerBadgeLabel(makeSummary({ payerRole: 'none', action: 'FULL_REFUND' }))).toBe('Refund issued');
  });

  it('labels neutral/close correctly', () => {
    expect(getPayerBadgeLabel(makeSummary({ payerRole: 'none', action: 'CLOSE_CASE' }))).toBe('Case closed');
  });
});
