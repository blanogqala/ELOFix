import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContactPage from './Contact';
import { COMPANY, CONTACT_EMAILS, formatRegisteredAddress, formatRegistrationNumber } from '@/lib/company';

vi.mock('@/components/layout/Header', () => ({
  Header: () => <header data-testid="header" />,
}));

vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer" />,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/api/contact', () => ({
  postContactForm: vi.fn(),
}));

describe('Contact page public identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows operator, support function, phone, address, registration, and public emails', () => {
    render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    );

    const page = document.body.textContent || '';

    expect(page).toContain(COMPANY.legalName);
    expect(page).toContain(COMPANY.operatorStatement);
    expect(page).toContain(COMPANY.customerSupportLabel);
    expect(page).toContain(COMPANY.phone);
    expect(page).toContain(formatRegisteredAddress());
    expect(page).toContain(COMPANY.country);
    expect(page).toContain(formatRegistrationNumber());
    expect(page).toContain('Physical business address');
    expect(page).not.toContain('Registered / physical business address');

    for (const contact of CONTACT_EMAILS) {
      expect(page).toContain(contact.label);
      expect(page).toContain(contact.email);
    }

    expect(screen.getAllByRole('link', { name: COMPANY.generalEmail }).length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole('link', { name: COMPANY.generalEmail })) {
      expect(link).toHaveAttribute('href', `mailto:${COMPANY.generalEmail}`);
    }
    expect(screen.getAllByRole('link', { name: COMPANY.phone })[0]).toHaveAttribute('href', COMPANY.phoneHref);
  });

  it('does not expose private finance or legacy support emails', () => {
    render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    );
    const page = document.body.textContent || '';
    expect(page).not.toContain('finance@litiholdings.co.za');
    expect(page).not.toContain('support@elofix.co.za');
  });
});
