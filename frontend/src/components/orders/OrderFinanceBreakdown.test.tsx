import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderFinanceBreakdown } from '@/components/orders/OrderFinanceBreakdown';

describe('OrderFinanceBreakdown', () => {
  it('labels 93% as supplier gross share, not a guaranteed bank amount', () => {
    render(
      <OrderFinanceBreakdown
        materialsSubtotal={50}
        showSupplierNet
      />
    );
    expect(screen.getByText('EloFix commission (7%)')).toBeTruthy();
    expect(screen.getByText('Supplier gross share (93%)')).toBeTruthy();
    expect(screen.queryByText('Supplier receives')).toBeNull();
    expect(screen.getAllByText('Pending confirmation').length).toBeGreaterThanOrEqual(2);
  });

  it('hides recipient rows on the customer path', () => {
    render(
      <OrderFinanceBreakdown
        materialsSubtotal={50}
        showSupplierNet={false}
      />
    );
    expect(screen.queryByText('Supplier gross share (93%)')).toBeNull();
    expect(screen.queryByText('Paystack processing fee')).toBeNull();
  });

  it('shows authoritative D3 processor fee when provided', () => {
    render(
      <OrderFinanceBreakdown
        materialsSubtotal={50}
        showSupplierNet
        processorFeeAmount={2.82}
        expectedBankSettlementAmount={43.68}
      />
    );
    expect(screen.queryByText('Pending confirmation')).toBeNull();
    expect(screen.getByText(/2,82/)).toBeTruthy();
    expect(screen.getByText(/43,68/)).toBeTruthy();
  });
});
