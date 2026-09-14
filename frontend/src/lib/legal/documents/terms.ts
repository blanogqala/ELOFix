import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';
import {
  COMPANY,
  LEGAL_OPERATOR_INTRO,
  formatRegisteredAddress,
  formatRegistrationNumber,
} from '../../company';

const EFFECTIVE = 'September 14, 2026';

export const termsOfService: LegalDocument = {
  id: 'terms',
  title: 'Terms of Service',
  subtitle: 'The rules and guidelines for using the EloFix marketplace in South Africa.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.terms,
  sections: [
    {
      id: 'introduction',
      title: '1. Introduction',
      content: [
        `Welcome to EloFix, a marketplace platform and trading brand operated by ${COMPANY.legalName} ("LITI", "we", "us", or "our"). These Terms of Service ("Terms") govern your access to and use of the EloFix platform, including our website, mobile experiences, and related services (collectively, the "Platform").`,
        LEGAL_OPERATOR_INTRO,
        'By creating an account, checking an acceptance box, or using the Platform, you agree to these Terms and to the policies incorporated by reference in Section 2. If you do not agree, you may not use EloFix.',
        'These Terms are subject to the Electronic Communications and Transactions Act 25 of 2002 (ECTA). Your electronic acceptance constitutes a binding agreement.',
      ],
    },
    {
      id: 'incorporated-policies',
      title: '2. Incorporated Policies',
      content: [
        'The following policies form part of your agreement with EloFix and are available on the Platform:',
        'Privacy Policy, Data Processing Policy, Cookie Policy, Device Security Policy, and Platform Activity Records Policy.',
        'Refund, Returns & Cancellation Policy, Delivery & Collection Policy, Payment Schedule and Transparency Policy, Job Completion Verification Policy, Dispute Resolution Policy, and Corrective Work Policy.',
        'Provider Agreement, Provider Verification Policy, Provider Reputation Policy, and Portfolio Content Rights (for Providers).',
        'Supplier Agreement and Supplier Participation Policy (for Suppliers).',
        'Community Standards, Fraud Prevention Policy, and Admin Review and Investigation Policy.',
        'In the event of conflict between these Terms and a role-specific agreement, the role-specific agreement prevails for that role.',
      ],
    },
    {
      id: 'definitions',
      title: '3. Definitions',
      content: [
        '"Customer" means a user who requests maintenance, repair, delivery, or related services through the Platform.',
        '"Provider" means an independent professional or business that offers services through the Platform.',
        '"Supplier" means a business that lists and fulfils materials or products through the EloFix supplier marketplace.',
        '"Branch User" means staff authorised to act on behalf of a Supplier branch.',
        '"Job" means a service engagement arranged between a Customer and a Provider through EloFix.',
        '"Materials" means products ordered through participating EloFix Suppliers in connection with a Job or store checkout.',
        '"Payment Schedule" means the applicable labor payment mode for a Job (TWO_PAYMENT_50_50, SINGLE_PAYMENT_UPFRONT, or SINGLE_PAYMENT_ON_COMPLETION) or the payment model for an order, including payment milestones and status, as described in the Payment Schedule and Transparency Policy. EloFix records applicable commissions and recipient shares. Recording a share is not the same as money being credited to a recipient bank account. Actual bank settlement is controlled by the applicable payment service provider and banking system.',
        '"Dispute" means a formal disagreement raised through the Platform regarding Job completion or payment.',
        '"Trust Score" means EloFix\'s internal reputation metric for Providers as described in the Provider Reputation Policy.',
        '"Admin" means an authorised EloFix administrator.',
      ],
    },
    {
      id: 'eligibility',
      title: '4. Eligibility',
      content: [
        'You must be at least 18 years old and capable of entering into a binding contract under South African law to use EloFix.',
        'Providers must complete identity verification, submit required documents, and receive approval before accepting paid Jobs, as described in the Provider Verification Policy.',
        'Suppliers must accept the Supplier Agreement and Supplier Participation Policy before operating on the Platform.',
        'You are responsible for ensuring that your use of the Platform complies with applicable laws in the Republic of South Africa.',
      ],
    },
    {
      id: 'platform-role',
      title: '5. EloFix as a Marketplace Facilitator',
      content: [
        'EloFix is a marketplace technology platform that connects Customers with independent Providers and Suppliers. EloFix is not the employer of Providers, is not a supplier of goods, and does not perform the services listed on the Platform.',
        'Providers are solely responsible for the quality, safety, legality, licensing, and delivery of their services. Customers contract directly with Providers for service work.',
        'Suppliers are solely responsible for the accuracy, quality, legality, and delivery of products they list and fulfil.',
        'Customer payment processing and supported marketplace settlement are performed through third-party payment service providers. Paystack is currently EloFix\'s primary live payment processor. EloFix may introduce, replace, or use another approved payment service provider in the future without rewriting this entire agreement, subject to applicable notice requirements.',
        'EloFix is not a bank, deposit-taker, wallet provider, insurer, or escrow agent. EloFix does not hold Provider or Supplier settlement funds as customer deposits.',
        'EloFix may record transaction and commission information, support communications, scheduling, verification, fraud prevention, and dispute processes, but does not guarantee outcomes of any Job, order, or Dispute.',
      ],
    },
    {
      id: 'accounts',
      title: '6. Accounts and Security',
      content: [
        'You must provide accurate registration information and keep your account credentials secure.',
        `You are responsible for all activity under your account. Notify us immediately of unauthorized access at ${COMPANY.email}.`,
        'We may suspend, restrict, or terminate accounts that violate these Terms, incorporated policies, applicable law, or Platform integrity requirements, including findings under the Fraud Prevention Policy.',
      ],
    },
    {
      id: 'payments',
      title: '7. Payments and Fees',
      content: [
        'Customers authorize EloFix and its applicable third-party payment service providers to process charges for Jobs, materials, delivery, and applicable platform fees. Paystack is currently EloFix\'s primary live payment processor.',
        'The current contractual EloFix platform commission is 7% on collected labor and materials transactions as further described in the Payment Schedule and Transparency Policy. The current Provider or Supplier gross marketplace share for an eligible collected amount is 93% of that amount.',
        'Where supported by the payment service provider and applicable settlement configuration, Paystack may split an eligible marketplace transaction between EloFix\'s platform commission and the Provider or Supplier\'s verified Paystack subaccount or other nominated payout destination. EloFix does not itself perform a second manual transfer of the ordinary 93% share after a supported split-at-charge marketplace settlement.',
        'Recording a Provider or Supplier share in EloFix is not the same as money being credited to the recipient\'s bank account. Successful Customer payment confirmation is not immediate bank settlement. Bank settlement timing is controlled by the payment processor and the banking system. EloFix does not guarantee a specific bank-credit date.',
        'Payment processor fees may reduce the net amount ultimately credited to a Provider or Supplier where the relevant gateway configuration makes that recipient responsible for processor fees. A recorded 93% marketplace share is a gross share and is not necessarily the exact net bank credit.',
        'If an outstanding customer service balance becomes payable, it is due within 30 calendar days. Failure to settle an outstanding amount within 30 calendar days may result in restrictions on new marketplace transactions, account suspension or blocking, referral for lawful debt recovery, and further legal action where appropriate. Login remains available so the Customer can pay the outstanding amount and contact EloFix.',
        'EloFix does not operate an account-credit, store-credit, wallet-credit, or EloFix-credit product.',
        'All prices, fees, and taxes are displayed or communicated before payment confirmation where required by the Consumer Protection Act 68 of 2008 (CPA) and ECTA.',
      ],
    },
    {
      id: 'conduct',
      title: '8. Acceptable Use',
      content: [
        'You must comply with the Community Standards at all times.',
        'You may not use the Platform for unlawful, fraudulent, abusive, or discriminatory activity.',
        'You may not circumvent Platform payments, solicit off-platform transactions in violation of Provider or Supplier policies, or interfere with Platform operations.',
        'We may remove content, restrict features, or report activity to authorities when necessary to protect users and the Platform.',
      ],
    },
    {
      id: 'intellectual-property',
      title: '9. Intellectual Property',
      content: [
        'EloFix owns the Platform, branding, software, and related intellectual property except for user-provided content.',
        'You retain ownership of content you submit, but grant EloFix the licences described in the Portfolio Content Rights and applicable role agreements to host, display, and use that content to operate the Platform.',
      ],
    },
    {
      id: 'indemnification',
      title: '10. Indemnification',
      content: [
        `You agree to indemnify, defend, and hold harmless ${COMPANY.legalName} (operating the EloFix Platform), its directors, officers, employees, and agents from claims, losses, damages, liabilities, and expenses (including reasonable legal fees) arising from your use of the Platform, your breach of these Terms or incorporated policies, or your violation of law or third-party rights.`,
        `Providers and Suppliers additionally indemnify ${COMPANY.legalName} for claims arising from services performed or products supplied by them, including personal injury, property damage, defective work, and regulatory non-compliance.`,
      ],
    },
    {
      id: 'disclaimers',
      title: '11. Disclaimers',
      content: [
        'The Platform is provided on an "as is" and "as available" basis to the fullest extent permitted by South African law.',
        'EloFix disclaims warranties of merchantability, fitness for a particular purpose, and non-infringement unless otherwise required by law.',
        'Nothing in these Terms excludes liability that cannot be excluded under the CPA, ECTA, or other mandatory law.',
      ],
    },
    {
      id: 'liability',
      title: '12. Limitation of Liability',
      content: [
        'To the maximum extent permitted by law, EloFix is not liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.',
        `EloFix's aggregate liability for claims relating to the Platform will not exceed the greater of (a) amounts paid by you to EloFix as platform fees in the twelve months before the claim, or (b) R1,500 (one thousand five hundred South African Rand), except where prohibited by law.`,
        'EloFix is not a bank, deposit-taker, wallet provider, escrow agent, or insurer and does not hold Provider or Supplier settlement funds as customer deposits. Customer payment processing and supported marketplace settlement are performed through third-party payment service providers. Paystack is currently EloFix\'s primary live payment processor. EloFix\'s payment recording, commission accounting, and settlement rules are described in the Payment Schedule and Transparency Policy.',
      ],
    },
    {
      id: 'force-majeure',
      title: '13. Force Majeure',
      content: [
        'EloFix is not liable for failure or delay in performance caused by events beyond our reasonable control, including natural disasters, load shedding, internet or payment gateway outages, labour disputes, government action, or civil unrest.',
      ],
    },
    {
      id: 'governing-law',
      title: '14. Governing Law and Jurisdiction',
      content: [
        'These Terms are governed by the laws of the Republic of South Africa.',
        'Subject to mandatory consumer protections and small claims court jurisdiction, you consent to the exclusive jurisdiction of the courts of South Africa for disputes arising from these Terms.',
      ],
    },
    {
      id: 'assignment',
      title: '15. Assignment',
      content: [
        'You may not assign your rights under these Terms without EloFix\'s prior written consent.',
        'EloFix may assign these Terms in connection with a merger, acquisition, financing, or sale of assets, subject to appropriate notice where required by law.',
      ],
    },
    {
      id: 'changes',
      title: '16. Changes to These Terms',
      content: [
        'We may update these Terms from time to time. When we make material changes, we will update the effective date and version and may require renewed acceptance before new marketplace transactions. You may still log in, view existing Jobs and disputes, settle outstanding payments, and access legal and contact pages.',
        'Your electronic acceptance of the updated documents is recorded. Previous acceptance records are retained.',
      ],
    },
    {
      id: 'contact',
      title: '17. Contact',
      content: [
        `Questions about these Terms may be sent to ${COMPANY.email}.`,
        `Legal entity: ${COMPANY.legalName}. ${COMPANY.operatorStatement} Company registration number: ${formatRegistrationNumber()}. Registered / physical business address: ${formatRegisteredAddress()}. Country of domicile: ${COMPANY.country}.`,
      ],
    },
  ],
};
