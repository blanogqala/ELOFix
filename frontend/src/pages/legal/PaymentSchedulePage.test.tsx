/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';
import { getLegalDocument } from '@/lib/legal/content';
import { LEGAL_ROUTES } from '@/lib/legal/versions';

describe('Payment Schedule page', () => {
  it('renders the Payment Schedule and Transparency Policy', () => {
    render(
      <MemoryRouter>
        <LegalPageLayout document={getLegalDocument('escrow-policy')} />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('heading', { name: 'Payment Schedule and Transparency Policy' })
    ).toBeInTheDocument();
    expect(screen.getByText(/generally T\+2 working days/i)).toBeInTheDocument();
    expect(LEGAL_ROUTES['escrow-policy']).toBe('/payment-schedule');
  });
});
