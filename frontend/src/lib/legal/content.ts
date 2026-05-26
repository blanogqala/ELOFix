import type { LegalDocumentId } from './versions';
import { LEGAL_VERSIONS } from './versions';

export interface LegalSection {
  id: string;
  title: string;
  content: string[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  subtitle: string;
  effectiveDate: string;
  version: string;
  sections: LegalSection[];
}

const termsOfService: LegalDocument = {
  id: 'terms',
  title: 'Terms of Service',
  subtitle: 'The rules and guidelines for using the EloFix marketplace.',
  effectiveDate: 'May 1, 2026',
  version: LEGAL_VERSIONS.terms,
  sections: [
    {
      id: 'introduction',
      title: '1. Introduction',
      content: [
        'Welcome to EloFix ("EloFix", "we", "us", or "our"). These Terms of Service ("Terms") govern your access to and use of the EloFix platform, including our website, mobile experiences, and related services (collectively, the "Platform").',
        'By creating an account or using the Platform, you agree to these Terms. If you do not agree, you may not use EloFix.',
      ],
    },
    {
      id: 'definitions',
      title: '2. Definitions',
      content: [
        '"Customer" means a user who requests maintenance, repair, or related services through the Platform.',
        '"Provider" means an independent professional or business that offers services through the Platform.',
        '"Job" means a service engagement arranged between a Customer and a Provider through EloFix.',
        '"Materials" means products ordered through EloFix partner suppliers in connection with a Job.',
      ],
    },
    {
      id: 'eligibility',
      title: '3. Eligibility',
      content: [
        'You must be at least 18 years old and capable of entering into a binding contract to use EloFix.',
        'Providers must complete identity verification, submit required documents, and receive approval before accepting paid Jobs.',
        'You are responsible for ensuring that your use of the Platform complies with applicable laws in your jurisdiction.',
      ],
    },
    {
      id: 'platform-role',
      title: '4. EloFix as a Marketplace',
      content: [
        'EloFix is a technology marketplace that connects Customers with independent Providers. EloFix is not the employer of Providers and does not perform the services listed on the Platform.',
        'Providers are solely responsible for the quality, safety, legality, and delivery of their services. Customers contract directly with Providers for service work.',
        'EloFix may facilitate payments, communications, scheduling, and dispute support, but does not guarantee outcomes of any Job.',
      ],
    },
    {
      id: 'accounts',
      title: '5. Accounts and Security',
      content: [
        'You must provide accurate registration information and keep your account credentials secure.',
        'You are responsible for all activity under your account. Notify us immediately of unauthorized access.',
        'We may suspend or terminate accounts that violate these Terms, applicable law, or Platform policies.',
      ],
    },
    {
      id: 'payments',
      title: '6. Payments and Fees',
      content: [
        'Customers authorize EloFix or its payment partners to process charges for Jobs, materials, delivery, and applicable platform fees.',
        'Providers receive payouts according to EloFix payout schedules, subject to verification, chargebacks, refunds, and compliance reviews.',
        'All prices, fees, and taxes are displayed or communicated before payment confirmation where required by law.',
      ],
    },
    {
      id: 'conduct',
      title: '7. Acceptable Use',
      content: [
        'You may not use the Platform for unlawful, fraudulent, abusive, or discriminatory activity.',
        'You may not circumvent Platform payments, solicit off-platform transactions in violation of Provider policies, or interfere with Platform operations.',
        'We may remove content, restrict features, or report activity to authorities when necessary to protect users and the Platform.',
      ],
    },
    {
      id: 'intellectual-property',
      title: '8. Intellectual Property',
      content: [
        'EloFix owns the Platform, branding, software, and related intellectual property except for user-provided content.',
        'You retain ownership of content you submit, but grant EloFix a limited license to host, display, and use that content to operate the Platform.',
      ],
    },
    {
      id: 'disclaimers',
      title: '9. Disclaimers',
      content: [
        'The Platform is provided on an "as is" and "as available" basis to the fullest extent permitted by law.',
        'EloFix disclaims warranties of merchantability, fitness for a particular purpose, and non-infringement unless otherwise required by law.',
      ],
    },
    {
      id: 'liability',
      title: '10. Limitation of Liability',
      content: [
        'To the maximum extent permitted by law, EloFix is not liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.',
        'EloFix\'s aggregate liability for claims relating to the Platform will not exceed the greater of amounts paid by you to EloFix in the twelve months before the claim or one hundred United States dollars, except where prohibited by law.',
      ],
    },
    {
      id: 'changes',
      title: '11. Changes to These Terms',
      content: [
        'We may update these Terms from time to time. When we make material changes, we will update the effective date and version and may require renewed acceptance before continued use.',
        'Your continued use after changes become effective constitutes acceptance of the updated Terms, unless additional consent is required by law or by Platform notice.',
      ],
    },
    {
      id: 'contact',
      title: '12. Contact',
      content: [
        'Questions about these Terms may be sent to legal@elofix.com or through the contact options listed on the EloFix website.',
      ],
    },
  ],
};

const privacyPolicy: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  subtitle: 'How EloFix collects, uses, and protects your information.',
  effectiveDate: 'May 1, 2026',
  version: LEGAL_VERSIONS.privacy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        'This Privacy Policy explains how EloFix processes personal information when you use our Platform.',
        'We design our data practices to support secure marketplace operations, payment processing, customer support, and legal compliance.',
      ],
    },
    {
      id: 'information-we-collect',
      title: '2. Information We Collect',
      content: [
        'Account information such as name, email address, phone number, profile photo, and role.',
        'Provider verification data such as identity documents, business registration, proof of address, certifications, and portfolio materials.',
        'Transaction information including Jobs, material orders, payment records, invoices, and delivery details.',
        'Technical information such as device type, browser, IP address, log data, and usage analytics.',
        'Communications you send through the Platform, including messages, support requests, and reviews.',
      ],
    },
    {
      id: 'how-we-use',
      title: '3. How We Use Information',
      content: [
        'To create and manage accounts, authenticate users, and provide Platform features.',
        'To match Customers with Providers, process payments, deliver notifications, and support Jobs and material orders.',
        'To verify Provider identity, prevent fraud, enforce policies, and maintain marketplace safety.',
        'To improve the Platform, analyze performance, and develop new features.',
        'To comply with legal obligations and respond to lawful requests.',
      ],
    },
    {
      id: 'sharing',
      title: '4. How We Share Information',
      content: [
        'With other users when necessary to complete a Job or order, such as sharing contact or location details relevant to service delivery.',
        'With payment processors, identity verification vendors, hosting providers, analytics tools, and other service providers under contractual safeguards.',
        'With regulators, law enforcement, or other parties when required by law or to protect rights, safety, and Platform integrity.',
        'In connection with a merger, acquisition, financing, or sale of assets, subject to appropriate confidentiality protections.',
      ],
    },
    {
      id: 'retention',
      title: '5. Data Retention',
      content: [
        'We retain personal information for as long as needed to provide the Platform, satisfy legal obligations, resolve disputes, and enforce agreements.',
        'Retention periods may vary based on document type, account status, and regulatory requirements.',
      ],
    },
    {
      id: 'security',
      title: '6. Security',
      content: [
        'We use administrative, technical, and organizational measures designed to protect personal information.',
        'No method of transmission or storage is completely secure. You should protect your account credentials and report suspicious activity promptly.',
      ],
    },
    {
      id: 'your-rights',
      title: '7. Your Rights and Choices',
      content: [
        'Depending on your location, you may have rights to access, correct, delete, restrict, or port your personal information.',
        'You may update certain account details in your profile settings and manage marketing preferences where offered.',
        'To exercise privacy rights, contact privacy@elofix.com. We may need to verify your identity before responding.',
      ],
    },
    {
      id: 'cookies',
      title: '8. Cookies and Similar Technologies',
      content: [
        'We use cookies and similar technologies for authentication, preferences, analytics, and security.',
        'You can manage cookies through browser settings, though some Platform features may not function properly if cookies are disabled.',
      ],
    },
    {
      id: 'international',
      title: '9. International Transfers',
      content: [
        'Your information may be processed in countries other than your own. Where required, we implement appropriate safeguards for cross-border transfers.',
      ],
    },
    {
      id: 'children',
      title: '10. Children',
      content: [
        'EloFix is not directed to children under 18, and we do not knowingly collect personal information from children.',
      ],
    },
    {
      id: 'updates',
      title: '11. Policy Updates',
      content: [
        'We may revise this Privacy Policy from time to time. Material changes will be reflected in the updated effective date and version, and we may request renewed consent where required.',
      ],
    },
    {
      id: 'contact',
      title: '12. Contact Us',
      content: [
        'Privacy questions or requests may be sent to privacy@elofix.com.',
      ],
    },
  ],
};

const providerAgreement: LegalDocument = {
  id: 'provider-agreement',
  title: 'Provider Agreement',
  subtitle: 'Additional terms for professionals offering services on EloFix.',
  effectiveDate: 'May 1, 2026',
  version: LEGAL_VERSIONS.providerAgreement,
  sections: [
    {
      id: 'relationship',
      title: '1. Independent Provider Relationship',
      content: [
        'This Provider Agreement supplements the EloFix Terms of Service for users who register as Providers.',
        'You acknowledge that you are an independent contractor and not an employee, agent, joint venturer, or partner of EloFix.',
        'You control how you perform services, subject to Customer requirements, applicable law, and Platform standards.',
      ],
    },
    {
      id: 'onboarding',
      title: '2. Onboarding and Verification',
      content: [
        'You must complete profile setup, submit required verification documents, and receive approval before accepting paid Jobs.',
        'EloFix may reject, suspend, or request updated documentation at any time based on verification results or policy violations.',
        'You represent that all submitted information and documents are accurate, current, and belong to you or your business.',
      ],
    },
    {
      id: 'service-standards',
      title: '3. Service Standards',
      content: [
        'You agree to perform services professionally, safely, and in compliance with applicable licenses, permits, and trade regulations.',
        'You will communicate clearly with Customers, honor agreed schedules where possible, and use the Platform for Job-related updates and payment flows unless otherwise permitted.',
        'You are responsible for your tools, labor, subcontractors, insurance, and tax obligations.',
      ],
    },
    {
      id: 'pricing',
      title: '4. Pricing, Quotes, and Changes',
      content: [
        'You may set labor pricing and propose quotes according to Platform workflows.',
        'Material recommendations and orders must follow EloFix ordering rules when Platform fulfillment is used.',
        'Any scope changes should be documented and approved through Platform flows before additional charges are incurred where applicable.',
      ],
    },
    {
      id: 'payments-payouts',
      title: '5. Payments and Payouts',
      content: [
        'EloFix may collect Customer payments on your behalf and release payouts after Job milestones, delivery confirmation, or dispute windows, as displayed in the Platform.',
        'Payouts may be delayed or withheld for fraud review, chargebacks, policy violations, incomplete verification, or legal compliance.',
        'You authorize EloFix to deduct applicable platform fees, refunds, adjustments, and chargebacks from amounts otherwise payable to you.',
      ],
    },
    {
      id: 'materials-delivery',
      title: '6. Materials and Delivery',
      content: [
        'When you recommend or fulfill materials, you must ensure accuracy of specifications and comply with supplier and delivery policies.',
        'Delivery ratings and fulfillment performance may affect your visibility, eligibility, and aggregate rating on the Platform.',
      ],
    },
    {
      id: 'reviews',
      title: '7. Reviews and Reputation',
      content: [
        'Customers may rate and review your services. EloFix may display aggregated ratings and completed Job metrics on your profile.',
        'You may not manipulate reviews, retaliate against Customers for honest feedback, or request removal of legitimate reviews except through Platform support processes.',
      ],
    },
    {
      id: 'insurance',
      title: '8. Insurance and Liability',
      content: [
        'You are solely responsible for injuries, property damage, or losses arising from your services unless otherwise required by law.',
        'EloFix recommends maintaining appropriate public liability, professional indemnity, and workers compensation coverage where applicable.',
      ],
    },
    {
      id: 'termination',
      title: '9. Suspension and Termination',
      content: [
        'EloFix may suspend or remove Provider access for policy violations, safety concerns, poor performance, or legal risk.',
        'You may deactivate your account subject to completion of outstanding Jobs, payment obligations, and dispute resolution requirements.',
      ],
    },
    {
      id: 'updates',
      title: '10. Updates',
      content: [
        'We may update this Provider Agreement from time to time. Material changes may require renewed acceptance before you continue accepting new Jobs.',
      ],
    },
  ],
};

const refundPolicy: LegalDocument = {
  id: 'refund-policy',
  title: 'Refund and Cancellation Policy',
  subtitle: 'How cancellations, refunds, and adjustments work on EloFix.',
  effectiveDate: 'May 1, 2026',
  version: LEGAL_VERSIONS.refundPolicy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        'This policy describes how cancellations and refunds are handled for service Jobs, labor charges, platform fees, and material orders arranged through EloFix.',
        'Specific refund eligibility may depend on Job status, payment timing, Provider acceptance, supplier fulfillment stage, and applicable law.',
      ],
    },
    {
      id: 'service-cancellations',
      title: '2. Service Job Cancellations',
      content: [
        'Customers may cancel a Job before a Provider begins work subject to any displayed cancellation terms at checkout or quote acceptance.',
        'If a Provider has accepted but not started work, cancellation may result in a partial charge or credit depending on preparation costs and Platform rules.',
        'Once work has started, refunds are generally limited to documented incomplete work, material errors not caused by the Customer, or Platform-verified service failures.',
      ],
    },
    {
      id: 'provider-cancellations',
      title: '3. Provider Cancellations',
      content: [
        'Providers should avoid cancellations after acceptance. Repeated cancellations may affect account standing, visibility, and payout eligibility.',
        'If a Provider cancels without valid reason, EloFix may assist the Customer with reassignment, credits, or refunds where appropriate.',
      ],
    },
    {
      id: 'material-orders',
      title: '4. Material Orders',
      content: [
        'Material orders may be cancelled before supplier acceptance or preparation begins, subject to supplier policies.',
        'Custom, special-order, delivered, or installed materials may not be refundable once fulfillment has progressed.',
        'Delivery issues, incorrect items, or damaged goods should be reported promptly through the Platform so EloFix and suppliers can investigate.',
      ],
    },
    {
      id: 'refund-process',
      title: '5. Refund Process',
      content: [
        'Approved refunds are returned to the original payment method where possible.',
        'Processing times vary by payment provider and bank, typically within 5–10 business days after approval.',
        'EloFix may issue account credits instead of cash refunds when permitted by policy or requested by the user.',
      ],
    },
    {
      id: 'disputes',
      title: '6. Disputes',
      content: [
        'If you disagree with a charge or refund decision, contact EloFix support with Job or order details, photos, messages, and any supporting documentation.',
        'EloFix may review Platform records, Provider responses, and supplier data before making a final determination.',
      ],
    },
    {
      id: 'chargebacks',
      title: '7. Chargebacks',
      content: [
        'Initiating a chargeback without first using Platform support may delay resolution and affect account access.',
        'Providers and suppliers may be debited for chargebacks, refunds, or adjustments associated with their Jobs or orders.',
      ],
    },
    {
      id: 'non-refundable',
      title: '8. Non-Refundable Items',
      content: [
        'Completed services properly delivered, non-returnable materials, third-party fees already incurred, and applicable platform service fees may be non-refundable except where required by law.',
      ],
    },
    {
      id: 'changes',
      title: '9. Policy Changes',
      content: [
        'We may update this policy from time to time. The effective date and version on this page indicate the current policy in effect.',
      ],
    },
    {
      id: 'contact',
      title: '10. Contact',
      content: [
        'Refund and cancellation questions may be sent to support@elofix.com with your Job or order reference number.',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: termsOfService,
  privacy: privacyPolicy,
  'provider-agreement': providerAgreement,
  'refund-policy': refundPolicy,
};

export function getLegalDocument(id: LegalDocumentId): LegalDocument {
  return LEGAL_DOCUMENTS[id];
}
