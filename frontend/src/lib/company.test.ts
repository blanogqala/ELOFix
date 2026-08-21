import { describe, it, expect } from 'vitest';
import {
  COMPANY,
  CONTACT_EMAILS,
  LEGAL_OPERATOR_INTRO,
  formatCopyright,
  formatRegisteredAddress,
  formatRegistrationNumber,
  unpublishedOr,
} from './company';

describe('company identity', () => {
  it('identifies LITI Holdings as operator and EloFix as brand', () => {
    expect(COMPANY.legalName).toBe('LITI Holdings (Pty) Ltd');
    expect(COMPANY.brandName).toBe('EloFix');
    expect(COMPANY.operatorStatement).toBe('EloFix is operated by LITI Holdings (Pty) Ltd.');
    expect(COMPANY.legalName).not.toContain('EloFix (Pty)');
  });

  it('exposes the published business contact details', () => {
    expect(COMPANY.email).toBe('elofix@litiholdings.co.za');
    expect(COMPANY.generalEmail).toBe('info@litiholdings.co.za');
    expect(COMPANY.phone).toBe('+27 67 428 3917');
    expect(COMPANY.phoneHref).toBe('tel:+27674283917');
    expect(COMPANY.website).toBe('https://www.elofix.co.za');
    expect(COMPANY.country).toBe('South Africa');
    expect(COMPANY.partnershipsEmail).toBe('partnerships@elofix.co.za');
    expect(COMPANY.customerSupportLabel).toBe('EloFix Customer Support');
  });

  it('maps public CONTACT_EMAILS to general, partnership, and legal channels', () => {
    expect(CONTACT_EMAILS).toEqual([
      { label: 'General enquiries', email: 'info@litiholdings.co.za' },
      { label: 'Partnership enquiries', email: 'partnerships@elofix.co.za' },
      { label: 'Legal & compliance', email: 'elofix@litiholdings.co.za' },
    ]);
  });

  it('does not expose private finance or legacy support mailboxes on COMPANY', () => {
    const serialized = JSON.stringify(COMPANY);
    expect(serialized).not.toContain('support@elofix.co.za');
    expect(serialized).not.toContain('finance@litiholdings.co.za');
    expect(COMPANY).not.toHaveProperty('supportEmail');
  });

  it('formats registration and address from shared config', () => {
    expect(formatRegistrationNumber()).toBe(COMPANY.registrationNumber);
    expect(formatRegisteredAddress()).toBe(COMPANY.registeredAddress);
    expect(unpublishedOr(null)).toBe('To be published');
    expect(unpublishedOr('')).toBe('To be published');
  });

  it('uses the 2026 operator copyright line', () => {
    expect(formatCopyright()).toBe(
      '© 2026 EloFix. Operated by LITI Holdings (Pty) Ltd. All rights reserved.',
    );
  });

  it('describes the marketplace operator relationship', () => {
    expect(LEGAL_OPERATOR_INTRO).toContain(COMPANY.legalName);
    expect(LEGAL_OPERATOR_INTRO).toContain('independent service providers and suppliers');
    expect(LEGAL_OPERATOR_INTRO).toContain('third-party payment service provider');
    expect(LEGAL_OPERATOR_INTRO).not.toContain('EloFix (Pty) Ltd');
  });
});
