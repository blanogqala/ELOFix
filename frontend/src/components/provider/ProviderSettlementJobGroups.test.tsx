import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ProviderSettlementJobGroups } from '@/components/provider/ProviderSettlementJobGroups';
import type { SettlementJobGroup } from '@/lib/providerSettlementGroups';

const processingGroup: SettlementJobGroup = {
  jobId: 'job-1',
  jobTitle: 'Tiling',
  jobCategory: 'tiling',
  customerName: 'Ada',
  stages: [
    {
      id: 'i1',
      jobId: 'job-1',
      paymentType: 'DEPOSIT',
      customerAmount: 50,
      commissionAmount: 3.5,
      providerShare: 46.5,
      merchantReference: 'EF-TEST',
      paidAt: '2026-09-15T10:00:00.000Z',
      paymentState: 'PAID',
      processorFeeAmount: 2.82,
      expectedBankSettlementAmount: 43.68,
      payoutSettlementStatus: 'PROCESSING',
    },
  ],
  totalCustomerPaid: 50,
  totalProviderShare: 46.5,
  totalCommission: 3.5,
  stagesPaid: 1,
  stagesExpected: 2,
  providerShareRemaining: 46.5,
  settlementLabel: 'Some customer payments confirmed',
};

describe('ProviderSettlementJobGroups', () => {
  it('shows payment confirmed, not Settled, when payout is processing', async () => {
    render(
      <MemoryRouter>
        <ProviderSettlementJobGroups groups={[processingGroup]} variant="history" />
      </MemoryRouter>
    );
    expect(screen.getByText('Some customer payments confirmed')).toBeInTheDocument();
    expect(screen.queryByText('Settled')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tiling/i }));
    expect(await screen.findByText('Payment confirmed')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.queryByText(/^Settled$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Expected bank settlement')).not.toBeInTheDocument();
    expect(screen.getByText(/2,82/)).toBeInTheDocument();
    expect(screen.queryByText('Pending confirmation')).not.toBeInTheDocument();
  });
});
