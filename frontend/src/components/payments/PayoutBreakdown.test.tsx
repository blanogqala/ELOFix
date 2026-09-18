import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PayoutBreakdown } from '@/components/payments/PayoutBreakdown';

describe('PayoutBreakdown', () => {
  it('shows the reported Paystack fee for provider surfaces without expected bank settlement', () => {
    render(
      <PayoutBreakdown
        customerAmount={50}
        commissionAmount={3.5}
        recipientGrossShare={46.5}
        processorFeeAmount={2.82}
        expectedBankSettlementAmount={43.68}
        payoutSettlementStatus="SETTLED"
        showExpectedBankSettlement={false}
      />
    );
    expect(screen.getByText('Customer payment')).toBeInTheDocument();
    expect(screen.getByText('EloFix commission (7%)')).toBeInTheDocument();
    expect(screen.getByText('Your gross share')).toBeInTheDocument();
    expect(screen.getByText('Paystack processing fee')).toBeInTheDocument();
    expect(screen.getByText(/2,82/)).toBeInTheDocument();
    expect(screen.queryByText('Pending confirmation')).not.toBeInTheDocument();
    expect(screen.queryByText('Expected bank settlement')).not.toBeInTheDocument();
    expect(screen.getByText('Payout status')).toBeInTheDocument();
    expect(screen.getByText('Settled by Paystack')).toBeInTheDocument();
  });

  it('keeps expected bank settlement on admin/supplier surfaces', () => {
    render(
      <PayoutBreakdown
        customerAmount={50}
        commissionAmount={3.5}
        recipientGrossShare={46.5}
        processorFeeAmount={2.82}
        expectedBankSettlementAmount={43.68}
        payoutSettlementStatus="PENDING"
      />
    );
    expect(screen.getByText('Expected bank settlement')).toBeInTheDocument();
  });
});
