/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminJobPaymentBreakdownCard } from '@/components/admin/AdminJobPaymentBreakdownCard';
import type { Job } from '@/types';

function jobStub(extras: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    category: 'tiling',
    categoryName: 'Tiling',
    userId: 'cust-1',
    userName: 'Customer',
    description: 'Test job',
    images: [],
    measurements: {},
    materials: [],
    laborEstimateRange: { min: 100, max: 100, unit: 'ZAR' },
    totalEstimateRange: { min: 100, max: 100 },
    paymentPlan: 'full',
    escrow: { heldAmount: 0, releasedAmount: 0 },
    status: 'IN_PROGRESS',
    jobNotes: [],
    chat: [],
    laborPaid: true,
    quotedAmount: 100,
    paymentModeSnapshot: 'FULL_UPFRONT',
    firstPaymentAmount: 100,
    paymentProgress: 'FULLY_PAID',
    commissionAmount: 7,
    providerAmount: 93,
    totalPrice: 100,
    payoutReconciliations: [
      {
        paymentIntentId: 'pi-1',
        merchantReference: 'EF-TEST-1',
        kind: 'LABOR',
        paymentType: 'FULL_UPFRONT',
        gateway: 'PAYSTACK',
        customerAmount: 100,
        commissionAmount: 7,
        recipientGrossShare: 93,
        expectedBankSettlementAmount: 87.5,
        payoutSettlementStatus: 'PENDING',
      },
    ],
    ...extras,
  } as Job;
}

describe('AdminJobPaymentBreakdownCard', () => {
  it('keeps the normal payment breakdown and does not render payout reconciliation', () => {
    render(<AdminJobPaymentBreakdownCard job={jobStub()} />);

    expect(screen.getByText('Payment breakdown')).toBeInTheDocument();
    expect(screen.getByText('Payment mode')).toBeInTheDocument();
    expect(screen.getByText('Total quote')).toBeInTheDocument();
    expect(screen.getByText('Platform fee (7%)')).toBeInTheDocument();
    expect(screen.getByText('Provider earnings (93%)')).toBeInTheDocument();
    expect(screen.getByText('Payment progress')).toBeInTheDocument();
    expect(screen.queryByText('Payout reconciliation')).not.toBeInTheDocument();
    expect(screen.queryByText('EF-TEST-1')).not.toBeInTheDocument();
  });
});
