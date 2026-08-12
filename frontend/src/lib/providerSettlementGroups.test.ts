import { describe, expect, it } from 'vitest';
import {
  formatSettlementStageLabel,
  groupSettlementRecordsByJob,
} from './providerSettlementGroups';
import type { ProviderSettlementRecord } from '@/lib/api/providerAccount';

const deposit: ProviderSettlementRecord = {
  id: 'i1',
  jobId: '61ec2dc3-aaaa',
  jobTitle: 'Tiling',
  paymentType: 'DEPOSIT',
  customerAmount: 500,
  commissionAmount: 35,
  providerShare: 465,
  merchantReference: 'EF-DEPOSIT',
  paidAt: '2026-08-10T10:00:00.000Z',
};

const completion: ProviderSettlementRecord = {
  id: 'i2',
  jobId: '61ec2dc3-aaaa',
  jobTitle: 'Tiling',
  paymentType: 'COMPLETION',
  customerAmount: 500,
  commissionAmount: 35,
  providerShare: 465,
  merchantReference: 'EF-COMPLETION',
  paidAt: '2026-08-10T21:00:00.000Z',
};

describe('groupSettlementRecordsByJob', () => {
  it('groups deposit + completion under one job with DEPOSIT first', () => {
    const groups = groupSettlementRecordsByJob([completion, deposit]);
    expect(groups).toHaveLength(1);
    expect(groups[0].jobId).toBe('61ec2dc3-aaaa');
    expect(groups[0].totalCustomerPaid).toBe(1000);
    expect(groups[0].totalProviderShare).toBe(930);
    expect(groups[0].totalCommission).toBe(70);
    expect(groups[0].stages.map((s) => s.paymentType)).toEqual(['DEPOSIT', 'COMPLETION']);
    expect(groups[0].stages[0].merchantReference).toBe('EF-DEPOSIT');
    expect(groups[0].stages[1].merchantReference).toBe('EF-COMPLETION');
  });

  it('handles deposit-only job as partially settled when a second stage is expected', () => {
    const groups = groupSettlementRecordsByJob([deposit], [
      {
        id: '61ec2dc3-aaaa',
        title: 'Tiling',
        category: 'tiling',
        amount: 1000,
        status: 'PENDING',
        laborPaid: true,
        paymentReleased: false,
        createdAt: '2026-08-10T10:00:00.000Z',
        providerShareRemaining: 465,
        paymentProgress: 'FIRST_PAID',
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].stagesPaid).toBe(1);
    expect(groups[0].settlementLabel).toBe('Partially settled');
  });

  it('formats stage labels', () => {
    expect(formatSettlementStageLabel('DEPOSIT')).toBe('Deposit');
    expect(formatSettlementStageLabel('COMPLETION')).toBe('Completion');
  });
});
