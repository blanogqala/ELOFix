import { describe, expect, it } from 'vitest';
import { toFrontendJob } from '@/lib/api/jobs';

function backendJob(extras: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    title: 'Tiling',
    description: 'Test job',
    price: 50,
    status: 'ACCEPTED',
    customerId: 'cust-1',
    createdAt: '2026-09-15T10:00:00.000Z',
    ...extras,
  };
}

describe('toFrontendJob payoutReconciliations', () => {
  it('preserves backend payout reconciliation rows without transforming amounts', () => {
    const row = {
      paymentIntentId: 'pi-1',
      merchantReference: 'EF-TEST',
      gateway: 'PAYSTACK',
      payoutSettlementStatus: 'PENDING',
      kind: 'LABOR',
      customerAmount: 50,
      commissionAmount: 3.5,
      recipientGrossShare: 46.5,
    };
    const mapped = toFrontendJob(
      backendJob({
        payoutReconciliations: [row],
      }) as Parameters<typeof toFrontendJob>[0]
    );
    expect(mapped.payoutReconciliations).toHaveLength(1);
    expect(mapped.payoutReconciliations?.[0]).toEqual(row);
    expect(mapped.payoutReconciliations?.[0].merchantReference).toBe('EF-TEST');
    expect(mapped.payoutReconciliations?.[0].gateway).toBe('PAYSTACK');
    expect(mapped.payoutReconciliations?.[0].customerAmount).toBe(50);
  });

  it('maps a missing payoutReconciliations field to an empty array', () => {
    const mapped = toFrontendJob(backendJob() as Parameters<typeof toFrontendJob>[0]);
    expect(mapped.payoutReconciliations).toEqual([]);
  });

  it('maps a non-array payoutReconciliations field to an empty array', () => {
    const mapped = toFrontendJob(
      backendJob({ payoutReconciliations: null }) as Parameters<typeof toFrontendJob>[0]
    );
    expect(mapped.payoutReconciliations).toEqual([]);
  });
});
