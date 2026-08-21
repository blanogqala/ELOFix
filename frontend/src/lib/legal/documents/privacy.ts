import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';
import {
  COMPANY,
  LEGAL_OPERATOR_INTRO,
  formatRegisteredAddress,
  formatRegistrationNumber,
} from '../../company';

const EFFECTIVE = 'August 18, 2026';

export const privacyPolicy: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  subtitle: `How ${COMPANY.legalName}, operating the EloFix Platform, collects, uses, and protects your personal information under POPIA.`,
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.privacy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This Privacy Policy explains how ${COMPANY.legalName} ("LITI", "we", "us"), operating the EloFix Platform ("EloFix"), processes personal information when you use our Platform.`,
        LEGAL_OPERATOR_INTRO,
        `${COMPANY.legalName} is the responsible party under the Protection of Personal Information Act 4 of 2013 (POPIA). Our Information Officer can be contacted at ${COMPANY.email}.`,
        `Registered / physical business address: ${formatRegisteredAddress()}. Company registration number: ${formatRegistrationNumber()}. Country of domicile: ${COMPANY.country}.`,
        'We design our data practices to support secure marketplace operations, payment processing, fraud prevention, customer support, and legal compliance.',
      ],
    },
    {
      id: 'lawful-basis',
      title: '2. Lawful Basis for Processing (POPIA Section 11)',
      content: [
        'Contractual necessity: account creation, Job fulfilment, payments, payment-schedule tracking, and communications between Customers, Providers, and Suppliers.',
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
        'Transaction data: Jobs, quotations, material orders, payment intents, invoices, payment schedule and payment status, refunds, commissions, recipient shares, and delivery tracking.',
        'Payment-related data processed by EloFix may include transaction identifiers, amounts, payment status, refund status, and ledger/accounting records. Sensitive card information is entered and processed through the applicable payment service provider. EloFix does not store CVV/CVC or full card numbers.',
        'Banking details provided for provider or supplier settlement destinations (which may remain pending verification until settlement is supported).',
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
        'To match Customers with Providers, process payments through payment service providers, record commissions and payment status, deliver notifications, and support Jobs and material orders.',
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
        'With third-party payment service providers, hosting providers, identity verification tools, device intelligence services (including FingerprintJS), analytics tools, and other subprocessors under contractual safeguards (see Data Processing Policy). Payment card and certain payment-instrument data may be processed directly by the payment service provider.',
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
        `No method of transmission or storage is completely secure. You should protect your account credentials and report suspicious activity promptly to ${COMPANY.email}.`,
      ],
    },
    {
      id: 'your-rights',
      title: '8. Your Rights and Choices (POPIA)',
      content: [
        'You have the right to request access to, correction of, deletion of, or restriction on processing of your personal information, subject to legal exceptions.',
        'You may object to processing based on legitimate interest where applicable.',
        'You may update certain account details in your profile settings and manage marketing preferences where offered.',
        `To exercise privacy rights, contact ${COMPANY.email}. We will respond within 30 days, subject to identity verification.`,
        'You have the right to lodge a complaint with the Information Regulator of South Africa if you believe your rights have been violated.',
        `Access to records may also be requested under the Promotion of Access to Information Act 2 of 2000 (PAIA) by contacting ${COMPANY.email}.`,
      ],
    },
    {
      id: 'ecta-cpa',
      title: '9. ECTA and Consumer Protection',
      content: [
        'Under ECTA, your electronic acceptance of Platform terms constitutes valid consent to electronic transactions and communications.',
        'Under the CPA, you have rights regarding fair and honest dealing, disclosure of prices, and remedy for defective goods or services. Nothing in this Policy limits mandatory consumer rights.',
        'Refund and cancellation rights are further described in the Refund, Returns & Cancellation Policy.',
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
        `Privacy questions or data subject requests: ${COMPANY.email} (Information Officer).`,
        `General / legal contact: ${COMPANY.email}.`,
      ],
    },
  ],
};
