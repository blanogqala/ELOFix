import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';

const ENTITY = 'EloFix (Pty) Ltd';
const EFFECTIVE = 'June 24, 2026';

export const privacyPolicy: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  subtitle: 'How EloFix (Pty) Ltd collects, uses, and protects your personal information under POPIA.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.privacy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This Privacy Policy explains how ${ENTITY} ("EloFix", "we", "us") processes personal information when you use our Platform.`,
        'EloFix is the responsible party under the Protection of Personal Information Act 4 of 2013 (POPIA). Our Information Officer can be contacted at privacy@elofix.com.',
        'Registered office: South Africa (full address to be published prior to public launch).',
        'We design our data practices to support secure marketplace operations, payment processing, fraud prevention, customer support, and legal compliance.',
      ],
    },
    {
      id: 'lawful-basis',
      title: '2. Lawful Basis for Processing (POPIA Section 11)',
      content: [
        'Contractual necessity: account creation, Job fulfilment, payments, escrow, and communications between Customers, Providers, and Suppliers.',
        'Legal obligation: tax, financial record-keeping, regulatory requests, and dispute records.',
        'Legitimate interest: fraud prevention, platform security, device intelligence, trust scoring, analytics, and service improvement — balanced against your rights.',
        'Consent: marketing communications, non-essential cookies, and optional features where we request explicit consent.',
        'Special personal information (Section 26): Provider identity documents and banking details are processed based on contractual necessity and legitimate interest for verification and payout integrity.',
      ],
    },
    {
      id: 'information-we-collect',
      title: '3. Information We Collect',
      content: [
        'Account information: name, email address, phone number, profile photo, role, and authentication credentials.',
        'Provider verification data: South African ID number, business registration, proof of address, certifications, banking information, and uploaded document files.',
        'Supplier data: business details, branch information, inventory, pricing, staff accounts, and order fulfilment records.',
        'Transaction data: Jobs, quotations, material orders, payment intents, invoices, escrow status, refunds, commissions, and delivery tracking.',
        'Dispute and evidence data: comments, images, videos, messages, and admin resolution records.',
        'Device and security data: device fingerprints, browser fingerprints, IP addresses, user agents, session activity, and login records (see Device Security Policy).',
        'Fraud and trust data: duplicate identity signals, fraud alerts, trust score history, and investigation notes.',
        'Communications: in-platform messages, notifications, support requests, reviews, and ratings.',
        'Audit records: admin actions, payment events, verification decisions, and system logs (see Platform Activity Records Policy).',
      ],
    },
    {
      id: 'how-we-use',
      title: '4. How We Use Information',
      content: [
        'To create and manage accounts, authenticate users, and provide Platform features.',
        'To match Customers with Providers, process payments and escrow, deliver notifications, and support Jobs and material orders.',
        'To verify Provider identity, prevent fraud, enforce policies, calculate trust scores, and maintain marketplace safety.',
        'To investigate disputes, process refunds, and support admin review decisions.',
        'To improve the Platform, analyze performance, and develop new features.',
        'To comply with legal obligations under POPIA, ECTA, CPA, and other applicable South African law.',
      ],
    },
    {
      id: 'sharing',
      title: '5. How We Share Information',
      content: [
        'With other users when necessary to complete a Job or order, such as sharing contact or location details relevant to service or delivery.',
        'With payment processors (PayFast, Payflex, PayJustNow), hosting providers, identity verification tools, device intelligence services (including FingerprintJS), analytics tools, and other subprocessors under contractual safeguards (see Data Processing Policy).',
        'With regulators, law enforcement, or other parties when required by law or to protect rights, safety, and Platform integrity.',
        'In connection with a merger, acquisition, financing, or sale of assets, subject to appropriate confidentiality protections.',
        'We do not sell personal information.',
      ],
    },
    {
      id: 'retention',
      title: '6. Data Retention',
      content: [
        'We retain personal information for as long as needed to provide the Platform, satisfy legal obligations, resolve disputes, and enforce agreements.',
        'Indicative retention periods: active account data for the duration of the account plus 5 years; KYC/verification documents for 5 years after relationship ends; payment and commission records for 7 years; audit logs for 5 years; device session records for 24 months; dispute records for 5 years after resolution; fraud investigation records for 5 years.',
        'Retention periods may vary based on document type, account status, and regulatory requirements. We delete or anonymize data when retention is no longer justified.',
      ],
    },
    {
      id: 'security',
      title: '7. Security',
      content: [
        'We use administrative, technical, and organizational measures designed to protect personal information, including encryption of sensitive fields, access controls, and audit logging.',
        'No method of transmission or storage is completely secure. You should protect your account credentials and report suspicious activity promptly to support@elofix.com.',
      ],
    },
    {
      id: 'your-rights',
      title: '8. Your Rights and Choices (POPIA)',
      content: [
        'You have the right to request access to, correction of, deletion of, or restriction on processing of your personal information, subject to legal exceptions.',
        'You may object to processing based on legitimate interest where applicable.',
        'You may update certain account details in your profile settings and manage marketing preferences where offered.',
        'To exercise privacy rights, contact privacy@elofix.com. We will respond within 30 days, subject to identity verification.',
        'You have the right to lodge a complaint with the Information Regulator of South Africa if you believe your rights have been violated.',
        'Access to records may also be requested under the Promotion of Access to Information Act 2 of 2000 (PAIA) by contacting privacy@elofix.com.',
      ],
    },
    {
      id: 'ecta-cpa',
      title: '9. ECTA and Consumer Protection',
      content: [
        'Under ECTA, your electronic acceptance of Platform terms constitutes valid consent to electronic transactions and communications.',
        'Under the CPA, you have rights regarding fair and honest dealing, disclosure of prices, and remedy for defective goods or services. Nothing in this Policy limits mandatory consumer rights.',
        'Refund and cancellation rights are further described in the Refund and Cancellation Policy.',
      ],
    },
    {
      id: 'cookies',
      title: '10. Cookies and Similar Technologies',
      content: [
        'We use cookies and similar technologies for authentication, preferences, analytics, and security. See our standalone Cookie Policy for details.',
      ],
    },
    {
      id: 'international',
      title: '11. International Transfers',
      content: [
        'Your information may be processed in countries other than South Africa, including where our hosting or subprocessors operate.',
        'Where required, we implement appropriate safeguards for cross-border transfers consistent with POPIA requirements.',
      ],
    },
    {
      id: 'children',
      title: '12. Children',
      content: [
        'EloFix is not directed to children under 18, and we do not knowingly collect personal information from children.',
      ],
    },
    {
      id: 'updates',
      title: '13. Policy Updates',
      content: [
        'We may revise this Privacy Policy from time to time. Material changes will be reflected in the updated effective date and version, and we may request renewed consent where required.',
      ],
    },
    {
      id: 'contact',
      title: '14. Contact Us',
      content: [
        'Privacy questions or data subject requests: privacy@elofix.com (Information Officer).',
        'General support: support@elofix.com.',
      ],
    },
  ],
};
