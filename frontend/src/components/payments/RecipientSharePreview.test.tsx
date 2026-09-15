import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecipientSharePreview } from '@/components/payments/RecipientSharePreview';

describe('RecipientSharePreview', () => {
  it('shows R100 customer / R7 commission / R93 gross share', () => {
    render(
      <RecipientSharePreview
        customerAmount={100}
        customerLabel="Customer service price"
        grossShareLabel="Your gross share (93%)"
      />
    );
    expect(screen.getByText('Customer service price')).toBeTruthy();
    expect(screen.getByText('EloFix commission (7%)')).toBeTruthy();
    expect(screen.getByText('Your gross share (93%)')).toBeTruthy();
    expect(screen.getByText(/100,00/)).toBeTruthy();
    expect(screen.getByText(/-R\s*7,00/)).toBeTruthy();
    expect(screen.getByText(/93,00/)).toBeTruthy();
    expect(screen.getAllByText('Confirmed after payment').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/confirmed after payment and may reduce the final amount/i)).toBeTruthy();
  });

  it('does not fabricate a numeric Paystack fee before confirmation', () => {
    render(<RecipientSharePreview customerAmount={50} />);
    expect(screen.getByText('Paystack processing fee')).toBeTruthy();
    expect(screen.getAllByText('Confirmed after payment').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('-R1.')).toBeNull();
  });
});
