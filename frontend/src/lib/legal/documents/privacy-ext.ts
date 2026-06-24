import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';

const EFFECTIVE = 'June 24, 2026';
const ENTITY = 'EloFix (Pty) Ltd';

export const dataProcessing: LegalDocument = {
  id: 'data-processing',
  title: 'Data Processing Policy',
  subtitle: 'How EloFix processes personal information as operator and uses subprocessors.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.dataProcessing,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This Data Processing Policy describes how ${ENTITY} ("EloFix") processes personal information in its role as responsible party under POPIA.`,
        'This policy supplements the Privacy Policy.',
      ],
    },
    {
      id: 'roles',
      title: '2. Roles',
      content: [
        'EloFix acts as the responsible party (operator) for personal information collected through the Platform.',
        'Payment gateways, hosting providers, and device intelligence services act as operators or processors processing data on EloFix\'s instructions.',
        'Providers and Suppliers who receive Customer data through Jobs or orders must process that data in compliance with POPIA for their own purposes.',
      ],
    },
    {
      id: 'subprocessors',
      title: '3. Subprocessors',
      content: [
        'EloFix uses the following categories of subprocessors:',
        'Payment processors: PayFast, Payflex, PayJustNow, and legacy payment integrations.',
        'Cloud hosting and database infrastructure providers.',
        'Device intelligence: FingerprintJS or equivalent fingerprinting technology.',
        'Email and notification delivery services.',
        'Maps and location services where applicable.',
        'Subprocessors are engaged under contractual terms requiring appropriate security and confidentiality.',
      ],
    },
    {
      id: 'security',
      title: '4. Security Measures',
      content: [
        'EloFix implements administrative, technical, and organizational measures including:',
        'Encryption of sensitive personal information at rest and in transit.',
        'Role-based access controls for administrator functions.',
        'Audit logging of sensitive operations.',
        'Hashing of identity and bank account numbers for duplicate detection.',
        'Regular security reviews of Platform infrastructure.',
      ],
    },
    {
      id: 'breach',
      title: '5. Data Breach Notification',
      content: [
        'In the event of a personal information breach, EloFix will assess the breach and notify the Information Regulator and affected data subjects as required by POPIA Section 22.',
        'Breach reports may be sent to privacy@elofix.com.',
      ],
    },
    {
      id: 'instructions',
      title: '6. Processing Instructions',
      content: [
        'EloFix processes personal information only for the purposes described in the Privacy Policy and incorporated Platform policies.',
        'EloFix does not sell personal information to third parties.',
      ],
    },
    {
      id: 'contact',
      title: '7. Contact',
      content: [
        'Data processing inquiries: privacy@elofix.com (Information Officer).',
      ],
    },
  ],
};

export const communityStandards: LegalDocument = {
  id: 'community-standards',
  title: 'Community Standards',
  subtitle: 'Expected behaviour and content standards for all EloFix users.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.communityStandards,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `These Community Standards describe expected behaviour for all users of ${ENTITY} ("EloFix").`,
        'Violations may result in content removal, account restrictions, or permanent removal from the Platform.',
      ],
    },
    {
      id: 'respect',
      title: '2. Respect and Safety',
      content: [
        'Treat other users with respect. Harassment, threats, hate speech, discrimination, and abusive language are prohibited.',
        'Do not engage in violence, intimidation, or unsafe behaviour on or off the Platform in connection with Jobs or orders.',
      ],
    },
    {
      id: 'honesty',
      title: '3. Honesty and Accuracy',
      content: [
        'Provide accurate information in profiles, listings, quotes, and communications.',
        'Do not misrepresent your identity, qualifications, business registration, or product specifications.',
        'Do not submit fraudulent verification documents or fake completion evidence.',
      ],
    },
    {
      id: 'payments',
      title: '4. Platform Payments',
      content: [
        'Use Platform payment flows for Jobs and orders arranged through EloFix.',
        'Do not circumvent Platform fees by soliciting off-platform payments for Platform-originated work.',
      ],
    },
    {
      id: 'content',
      title: '5. Content Standards',
      content: [
        'Do not upload illegal, obscene, defamatory, or infringing content.',
        'Completion photos, reviews, and portfolio images must relate to actual completed work.',
        'Do not manipulate reviews, post fake ratings, or retaliate against users for honest feedback.',
      ],
    },
    {
      id: 'prohibited',
      title: '6. Prohibited Activity',
      content: [
        'Prohibited activity includes: fraud, identity theft, money laundering, spam, malware distribution, scraping, unauthorized access, and interference with Platform operations.',
        'Creating duplicate accounts to evade restrictions is prohibited. See the Fraud Prevention Policy.',
      ],
    },
    {
      id: 'enforcement',
      title: '7. Enforcement',
      content: [
        'EloFix may warn, restrict, suspend, or permanently remove accounts for Community Standards violations.',
        'Serious violations may be reported to law enforcement.',
        'See the Admin Review and Investigation Policy for administrator enforcement authority.',
      ],
    },
    {
      id: 'contact',
      title: '8. Report Violations',
      content: [
        'Report Community Standards violations to support@elofix.com.',
      ],
    },
  ],
};

export const cookiePolicy: LegalDocument = {
  id: 'cookie-policy',
  title: 'Cookie Policy',
  subtitle: 'How EloFix uses cookies and similar technologies.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.cookiePolicy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This Cookie Policy explains how ${ENTITY} ("EloFix") uses cookies and similar technologies on the Platform.`,
        'This policy supplements the Privacy Policy.',
      ],
    },
    {
      id: 'what-are-cookies',
      title: '2. What Are Cookies',
      content: [
        'Cookies are small text files stored on your device when you visit a website. Similar technologies include local storage, session tokens, and pixel tags.',
      ],
    },
    {
      id: 'cookies-we-use',
      title: '3. Cookies We Use',
      content: [
        'Essential cookies: required for authentication, session management, and security. These cannot be disabled without affecting Platform functionality.',
        'Preference cookies: remember your settings and choices.',
        'Analytics cookies: help us understand how the Platform is used and improve performance.',
        'Security cookies: support fraud prevention and device recognition in conjunction with the Device Security Policy.',
      ],
    },
    {
      id: 'third-party',
      title: '4. Third-Party Cookies',
      content: [
        'Payment partners, maps services, and analytics providers may set their own cookies when you interact with their features on the Platform.',
        'We do not control third-party cookies. Refer to those providers\' privacy policies for details.',
      ],
    },
    {
      id: 'managing',
      title: '5. Managing Cookies',
      content: [
        'You can manage cookies through your browser settings. Disabling essential cookies may prevent you from logging in or using core Platform features.',
        'To exercise broader privacy rights, contact privacy@elofix.com.',
      ],
    },
    {
      id: 'contact',
      title: '6. Contact',
      content: [
        'Cookie questions: privacy@elofix.com.',
      ],
    },
  ],
};
