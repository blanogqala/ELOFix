/** Shared legal-identity and public contact details for EloFix / LITI Holdings. */

export const COMPANY = {
  legalName: 'LITI Holdings (Pty) Ltd',
  brandName: 'EloFix',
  operatorStatement: 'EloFix is operated by LITI Holdings (Pty) Ltd.',
  website: 'https://www.elofix.co.za',
  websiteDisplay: 'www.elofix.co.za',
  /** Legal & compliance (Information Officer / policy contact). */
  email: 'elofix@litiholdings.co.za',
  /** General customer enquiries and Contact form destination. */
  generalEmail: 'info@litiholdings.co.za',
  partnershipsEmail: 'partnerships@elofix.co.za',
  phone: '+27 67 428 3917',
  phoneHref: 'tel:+27674283917',
  registrationNumber: '2025/260206/07',
  registeredAddress: '9 Albany Street, Cape Town, 7530',
  country: 'South Africa',
  copyrightYear: 2026,
  /** Public contact function label for FNB-style website vetting. */
  customerSupportLabel: 'EloFix Customer Support',
} as const;

export type CompanyInfo = typeof COMPANY;

export const CONTACT_EMAILS = [
  { label: 'General enquiries', email: COMPANY.generalEmail },
  { label: 'Partnership enquiries', email: COMPANY.partnershipsEmail },
  { label: 'Legal & compliance', email: COMPANY.email },
] as const;

export function unpublishedOr(value: string | null | undefined, fallback = 'To be published'): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function formatRegistrationNumber(): string {
  return unpublishedOr(COMPANY.registrationNumber);
}

export function formatRegisteredAddress(): string {
  return unpublishedOr(COMPANY.registeredAddress);
}

export function formatCopyright(): string {
  return `© ${COMPANY.copyrightYear} ${COMPANY.brandName}. Operated by ${COMPANY.legalName}. All rights reserved.`;
}

/** Standard operator relationship used in public legal documents. */
export const LEGAL_OPERATOR_INTRO =
  `${COMPANY.brandName} is a marketplace platform and trading brand operated by ${COMPANY.legalName}. ${COMPANY.legalName} is the contracting legal entity operating EloFix. Customers use EloFix to connect with independent service providers and suppliers. Service providers and suppliers remain responsible for the services and goods they provide, subject to the applicable platform agreements. Payment processing is handled through applicable third-party payment service provider(s).`;
