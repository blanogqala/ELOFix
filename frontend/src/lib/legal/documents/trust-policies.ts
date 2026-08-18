import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';
import { COMPANY, LEGAL_OPERATOR_INTRO } from '../../company';

const EFFECTIVE = 'August 18, 2026';

export const portfolioContentRights: LegalDocument = {
  id: 'portfolio-content-rights',
  title: 'Portfolio Content Rights',
  subtitle: 'How completion evidence, reviews, and ratings may be displayed on EloFix.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.portfolioContentRights,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes the rights granted to ${COMPANY.legalName}, operating the EloFix Platform, to display Customer-submitted completion content on Provider portfolios and Platform marketing.`,
        LEGAL_OPERATOR_INTRO,
      ],
    },
    {
      id: 'customer-submissions',
      title: '2. Customer Submissions',
      content: [
        'When a Customer accepts completed work, they may upload photographs, videos, star ratings, and written reviews.',
        'Upon submission, the Customer grants EloFix a non-exclusive, royalty-free, worldwide licence to host, display, reproduce, and distribute such content on the Platform.',
        'This licence includes display on Provider portfolio pages, Provider profile pages, search results, and Platform marketing materials.',
        'The Customer retains ownership of their content. The licence is limited to operating and promoting the Platform.',
      ],
    },
    {
      id: 'provider-portfolios',
      title: '3. Provider Portfolios',
      content: [
        'Provider portfolios may display verified completed projects including photographs, videos, ratings, reviews, and completion dates.',
        'Where a Job was automatically accepted after the 7-day verification window without a Customer review, the portfolio entry may be displayed without a public star rating and may be flagged as auto-completed.',
        'Providers may also upload curated portfolio images and work posts subject to Community Standards.',
      ],
    },
    {
      id: 'removal',
      title: '4. Content Removal',
      content: [
        'EloFix may remove or restrict content that violates the Community Standards, infringes third-party rights, or is required to be removed by law.',
        `Customers may request review of portfolio content through ${COMPANY.email}. EloFix will assess requests in accordance with POPIA and this policy.`,
      ],
    },
    {
      id: 'survival',
      title: '5. Licence Duration',
      content: [
        'The licence granted upon submission survives account deactivation for historical Job records associated with completed work, to the extent necessary to maintain accurate marketplace records and Provider portfolios.',
      ],
    },
    {
      id: 'contact',
      title: '6. Contact',
      content: [
        `Portfolio content questions: ${COMPANY.email}.`,
      ],
    },
  ],
};

export const providerVerification: LegalDocument = {
  id: 'provider-verification',
  title: 'Provider Verification Policy',
  subtitle: 'Identity and business verification requirements for EloFix Providers.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.providerVerification,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes the verification requirements for Providers on the EloFix Platform, operated by ${COMPANY.legalName}, before they may accept paid Jobs and receive settlement of eligible funds where supported.`,
        LEGAL_OPERATOR_INTRO,
      ],
    },
    {
      id: 'required-documents',
      title: '2. Required Documents',
      content: [
        'Providers may be required to submit the following documents and information:',
        'South African identity document (ID book or smart card).',
        'Business registration documents (company registration certificate or equivalent for registered businesses).',
        'Proof of address (not older than 3 months where applicable).',
        'Banking information for a settlement destination profile. Bank details saved is not the same as bank account verification pending, gateway payout destination verified, settlement supported, or settlement completed.',
        'Optional: proof of skill, trade certifications, or professional qualifications.',
        'EloFix may request additional documentation at any time.',
      ],
    },
    {
      id: 'verification-process',
      title: '3. Verification Process',
      content: [
        'Providers upload documents through the Platform. Documents are reviewed by EloFix administrators.',
        'Each document may be individually approved or rejected with feedback.',
        'Provider account approval requires all mandatory documents to be approved, profile completion, and clearance of fraud review.',
        'Banking details may remain pending verification. Adding banking details does not authorize EloFix to debit the account and does not guarantee that automatic bank settlement is available.',
      ],
    },
    {
      id: 'denial-revocation',
      title: '4. Denial and Revocation',
      content: [
        'Verification may be denied if documents are incomplete, invalid, fraudulent, or do not match account information.',
        'Verification may be revoked if documents expire, fraud is detected, duplicate identities are found, or policy violations occur.',
        'Providers with fraud review status PENDING_REVIEW or REJECTED cannot be approved until cleared by administrators.',
      ],
    },
    {
      id: 'duplicate-checks',
      title: '5. Duplicate Identity Checks',
      content: [
        'EloFix checks for duplicate South African ID numbers, company registration numbers, bank accounts, and document file hashes across the Platform.',
        'Duplicate matches trigger fraud alerts and may block verification approval. See the Fraud Prevention Policy.',
      ],
    },
    {
      id: 'popia',
      title: '6. POPIA and Special Personal Information',
      content: [
        'Identity documents and banking details constitute special personal information under POPIA Section 26.',
        'EloFix processes this information based on contractual necessity for Provider onboarding and legitimate interest for fraud prevention and settlement-destination integrity.',
        'Sensitive fields are encrypted or hashed where appropriate. See the Privacy Policy.',
      ],
    },
    {
      id: 'contact',
      title: '7. Contact',
      content: [
        `Verification questions: ${COMPANY.email}.`,
      ],
    },
  ],
};

export const fraudPrevention: LegalDocument = {
  id: 'fraud-prevention',
  title: 'Fraud Prevention Policy',
  subtitle: 'How EloFix detects and responds to fraudulent activity.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.fraudPrevention,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes how ${COMPANY.legalName}, operating the EloFix Platform, monitors for and responds to fraudulent activity on the Platform.`,
        LEGAL_OPERATOR_INTRO,
      ],
    },
    {
      id: 'monitoring',
      title: '2. What EloFix Monitors',
      content: [
        'EloFix may monitor for indicators of fraud including:',
        'Duplicate accounts linked to the same phone number, email patterns, or identity documents.',
        'Duplicate South African ID numbers, company registration numbers, or bank accounts across accounts.',
        'Duplicate or reused verification document files.',
        'Suspicious devices sharing fingerprints across multiple accounts.',
        'Unusual payment behaviour, chargebacks, and refund patterns.',
        'Suspicious login activity and session anomalies.',
      ],
    },
    {
      id: 'device-rules',
      title: '3. Device-Based Rules',
      content: [
        'More than 5 Provider accounts on the same device may trigger a suspicious device alert.',
        'More than 10 Customer accounts on the same device may trigger a suspicious device alert.',
        'Two or more Provider accounts sharing a device fingerprint may trigger investigation.',
      ],
    },
    {
      id: 'actions',
      title: '4. EloFix Actions',
      content: [
        'In response to suspected fraud, EloFix may:',
        'Suspend or restrict accounts.',
        'Request additional verification documents.',
        'Reject new registrations.',
        'Block Provider approval pending fraud review.',
        'Revoke verification status.',
        'Withhold or reverse settlement instructions or recorded payouts where supported by Platform accounting and the payment service provider.',
        'Report activity to law enforcement where appropriate.',
      ],
    },
    {
      id: 'trust-impact',
      title: '5. Trust Score Impact',
      content: [
        'Fraud alerts and duplicate registrations may reduce Provider trust scores. See the Provider Reputation Policy for penalty amounts.',
        'Fake or duplicate documentation may result in significant trust score penalties and permanent account removal.',
      ],
    },
    {
      id: 'contact',
      title: '6. Contact',
      content: [
        `Fraud concerns: ${COMPANY.email}.`,
      ],
    },
  ],
};

export const deviceSecurity: LegalDocument = {
  id: 'device-security',
  title: 'Device Security Policy',
  subtitle: 'How EloFix collects and uses device information for security and fraud prevention.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.deviceSecurity,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes the device and session information collected by ${COMPANY.legalName}, operating the EloFix Platform, for security, fraud prevention, and account protection, in alignment with POPIA.`,
        'This policy supplements the Privacy Policy.',
      ],
    },
    {
      id: 'data-collected',
      title: '2. Information Collected',
      content: [
        'EloFix may collect the following device and session information when you log in or register:',
        'Device fingerprint (visitor identifier generated by FingerprintJS or similar technology).',
        'Browser fingerprint and user agent string.',
        'IP address.',
        'Operating system and browser type.',
        'Approximate geographic location derived from IP (country and city).',
        'Session activity and login timestamps.',
        'Login count per device-user link.',
      ],
    },
    {
      id: 'purpose',
      title: '3. Purpose of Collection',
      content: [
        'Device information is collected for:',
        'Account security and unauthorized access detection.',
        'Fraud prevention and duplicate account identification.',
        'Investigation of suspicious activity.',
        'Platform integrity and abuse prevention.',
      ],
    },
    {
      id: 'popia-basis',
      title: '4. POPIA Lawful Basis',
      content: [
        'EloFix processes device information based on legitimate interest in protecting the Platform and its users, balanced against your privacy rights.',
        'Device data is not sold to third parties.',
        'Device session records are retained for approximately 24 months, subject to the Privacy Policy retention schedule.',
      ],
    },
    {
      id: 'collection-timing',
      title: '5. When Collection Occurs',
      content: [
        'Device fingerprinting is initiated after successful login or registration through the Platform.',
        'Collection is non-blocking and does not prevent account access if fingerprinting fails.',
      ],
    },
    {
      id: 'your-rights',
      title: '6. Your Rights',
      content: [
        `You may contact ${COMPANY.email} to exercise POPIA rights regarding device data, including access and objection where applicable.`,
      ],
    },
    {
      id: 'contact',
      title: '7. Contact',
      content: [
        `Device security questions: ${COMPANY.email}.`,
      ],
    },
  ],
};

export const providerReputation: LegalDocument = {
  id: 'provider-reputation',
  title: 'Provider Reputation Policy',
  subtitle: 'How EloFix calculates and uses Provider trust scores.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.providerReputation,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes the EloFix Provider trust score system operated by ${COMPANY.legalName} and how it may affect Provider visibility and ranking on the Platform.`,
        'Trust scores are an internal reputation metric. They are not a guarantee of service quality.',
      ],
    },
    {
      id: 'score-range',
      title: '2. Score Range and Levels',
      content: [
        'Provider trust scores range from 0 to 100. New Providers start at 100.',
        'Trust levels include: Elite Provider (90–100), Trusted Provider (75–89), Monitor (60–74), Restricted (40–59), and High Risk (0–39).',
        'Trust levels may affect Provider visibility, search ranking, and eligibility for certain Platform features at EloFix\'s discretion.',
      ],
    },
    {
      id: 'factors',
      title: '3. Factors Considered',
      content: [
        'Trust scores may consider:',
        'Verification status and approved identity documents.',
        'Customer reviews and star ratings.',
        'Job completion rate.',
        'Disputes opened and dispute outcomes.',
        'Refunds (partial and full).',
        'Customer complaints and fraud alerts.',
        'Months without disputes or fraud alerts.',
      ],
    },
    {
      id: 'adjustments',
      title: '4. Score Adjustments',
      content: [
        'Indicative adjustments include:',
        'Job completed: +2. Five-star review included in completion: +3 total.',
        'Verified ID, company registration, or bank account: +10 each (once).',
        'Month without disputes or fraud alerts: +5 (periodic).',
        'Partial refund: −10. Full refund: −25.',
        'Dispute lost: −15. Fraud alert: −20.',
        'Duplicate registration: −25. Fake documentation: −50. Suspicious login: −10.',
        'Automatic acceptance after 7-day window applies a neutral trust adjustment.',
        'EloFix may adjust scoring methodology with notice through policy updates.',
      ],
    },
    {
      id: 'not-a-guarantee',
      title: '5. Not a Guarantee',
      content: [
        'Trust scores and levels are provided for marketplace transparency and safety. They do not constitute a warranty of Provider skill, reliability, or suitability.',
        'Customers should review Provider profiles, reviews, and portfolios when selecting a Provider.',
      ],
    },
    {
      id: 'contact',
      title: '6. Contact',
      content: [
        `Trust score questions: ${COMPANY.email}.`,
      ],
    },
  ],
};

export const platformActivityRecords: LegalDocument = {
  id: 'platform-activity-records',
  title: 'Platform Activity Records Policy',
  subtitle: 'How EloFix stores activity records for security, compliance, and legal defence.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.platformActivityRecords,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes the Platform activity records maintained by ${COMPANY.legalName}, operating the EloFix Platform.`,
        'This policy supplements the Privacy Policy.',
      ],
    },
    {
      id: 'records-stored',
      title: '2. Records Stored',
      content: [
        'EloFix may store the following categories of activity records:',
        'Login and authentication records.',
        'Payment and payment-schedule transaction records.',
        'Provider verification and document review records.',
        'Fraud investigation and alert records.',
        'Dispute submissions, messages, and resolution actions.',
        'Administrator actions on accounts, payments, disputes, refunds, and settlement records.',
        'Job status changes, completion events, and automatic acceptance events.',
        'Review and rating submissions.',
        'Device session records.',
      ],
    },
    {
      id: 'purposes',
      title: '3. Purposes',
      content: [
        'Activity records are maintained for:',
        'Platform security and fraud prevention.',
        'Regulatory and legal compliance.',
        'Dispute investigation and resolution.',
        'Legal defence and evidence preservation.',
        'Service improvement and audit.',
      ],
    },
    {
      id: 'access',
      title: '4. Access and Confidentiality',
      content: [
        'Access to activity records is limited to authorised EloFix administrators and subprocessors with a legitimate need.',
        'Records are protected by access controls and security measures described in the Privacy Policy.',
      ],
    },
    {
      id: 'retention',
      title: '5. Retention',
      content: [
        'Activity records are retained in accordance with the retention schedule in the Privacy Policy.',
        'Audit logs are typically retained for 5 years. Payment records for 7 years. Device sessions for 24 months.',
      ],
    },
    {
      id: 'contact',
      title: '6. Contact',
      content: [
        `Records inquiries: ${COMPANY.email}.`,
      ],
    },
  ],
};
