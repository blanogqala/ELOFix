import { describe, it, expect } from 'vitest';
import {
  COMPANY,
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
    expect(COMPANY.phone).toBe('+27 67 428 3917');
    expect(COMPANY.website).toBe('https://www.elofix.co.za');
    expect(COMPANY.country).toBe('South Africa');
    expect(COMPANY.partnershipsEmail).toBe('partnerships@elofix.co.za');
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
