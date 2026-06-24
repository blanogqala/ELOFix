import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';

const EFFECTIVE = 'June 24, 2026';

export const providerAgreement: LegalDocument = {
  id: 'provider-agreement',
  title: 'Provider Agreement',
  subtitle: 'Additional terms for professionals offering services on EloFix.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.providerAgreement,
  sections: [
    {
      id: 'relationship',
      title: '1. Independent Provider Relationship',
      content: [
        'This Provider Agreement supplements the EloFix Terms of Service for users who register as Providers.',
        'You acknowledge that you are an independent contractor and not an employee, agent, joint venturer, or partner of EloFix (Pty) Ltd.',
        'You control how you perform services, subject to Customer requirements, applicable South African law, and Platform standards.',
        'You are responsible for your own tax, UIF, COIDA, and statutory obligations as an independent service provider.',
      ],
    },
    {
      id: 'onboarding',
      title: '2. Onboarding and Verification',
      content: [
        'You must complete profile setup, submit required verification documents, and receive approval before accepting paid Jobs, as described in the Provider Verification Policy.',
        'Required documents may include South African ID, business registration, proof of address, banking information, and optional certifications.',
        'EloFix may reject, suspend, revoke verification, or request updated documentation at any time based on verification results, fraud review status, or policy violations.',
        'You represent that all submitted information and documents are accurate, current, and belong to you or your business.',
      ],
    },
    {
      id: 'service-standards',
      title: '3. Service Standards',
      content: [
        'You agree to perform services professionally, safely, and in compliance with applicable licenses, permits, and trade regulations in South Africa.',
        'You will communicate clearly with Customers, honor agreed schedules where possible, and use the Platform for Job-related updates and payment flows.',
        'You are responsible for your tools, labor, subcontractors, insurance, and tax obligations.',
        'If instructed to return for corrective work under the Corrective Work Policy, you must complete remedial work and re-submit the Job for Customer verification.',
      ],
    },
    {
      id: 'pricing',
      title: '4. Pricing, Quotes, and Changes',
      content: [
        'You may set labor pricing and propose quotes according to Platform workflows.',
        'Material recommendations and orders must follow EloFix ordering rules when Platform fulfilment is used.',
        'Any scope changes should be documented and approved through Platform flows before additional charges are incurred where applicable.',
      ],
    },
    {
      id: 'payments-payouts',
      title: '5. Payments, Escrow, and Payouts',
      content: [
        'EloFix collects Customer labor payments and releases your share through staged escrow as described in the Escrow and Payment Protection Policy.',
        'Approximately 50% of your provider share (93% of gross labor after 7% platform commission) is released when labor payment is confirmed. The remaining share is released upon Customer confirmation, admin release, or automatic acceptance after the 7-day completion window.',
        'Payouts may be delayed or withheld for fraud review, open disputes, chargebacks, policy violations, incomplete verification, or legal compliance.',
        'You authorize EloFix to deduct applicable platform fees, refunds, clawbacks, adjustments, and chargebacks from amounts otherwise payable to you.',
      ],
    },
    {
      id: 'job-completion',
      title: '6. Job Completion and Customer Verification',
      content: [
        'When you mark a Job as complete, the Customer receives notification and has 7 calendar days to accept or dispute the work under the Job Completion Verification Policy.',
        'If the Customer does not respond within 7 days, the Job may be automatically approved and your remaining escrow tranche released.',
        'Open disputes block automatic acceptance and may freeze remaining escrow until resolved.',
      ],
    },
    {
      id: 'materials-delivery',
      title: '7. Materials and Delivery',
      content: [
        'When you recommend or fulfil materials, you must ensure accuracy of specifications and comply with supplier and delivery policies.',
        'Delivery ratings and fulfilment performance may affect your visibility, eligibility, and aggregate rating on the Platform.',
      ],
    },
    {
      id: 'reviews-reputation',
      title: '8. Reviews, Reputation, and Trust Score',
      content: [
        'Customers may rate and review your services. EloFix may display aggregated ratings, completed Job metrics, and portfolio content on your profile.',
        'Your Trust Score is calculated under the Provider Reputation Policy based on verification, reviews, completion rate, disputes, refunds, and fraud signals. Trust scores may affect your visibility and ranking.',
        'You may not manipulate reviews, retaliate against Customers for honest feedback, or request removal of legitimate reviews except through Platform support processes.',
      ],
    },
    {
      id: 'fraud-compliance',
      title: '9. Fraud Prevention and Compliance',
      content: [
        'You agree to comply with the Fraud Prevention Policy and Device Security Policy.',
        'Duplicate identities, suspicious devices, or fraudulent documentation may result in suspension, verification revocation, or permanent removal.',
        'Provider approval may be blocked while fraud review status is PENDING_REVIEW or REJECTED.',
      ],
    },
    {
      id: 'insurance',
      title: '10. Insurance and Liability',
      content: [
        'You are solely responsible for injuries, property damage, or losses arising from your services unless otherwise required by law.',
        'EloFix recommends maintaining appropriate public liability, professional indemnity, and workers compensation coverage where applicable.',
        'You indemnify EloFix for claims arising from your services, as described in the Terms of Service.',
      ],
    },
    {
      id: 'termination',
      title: '11. Suspension and Termination',
      content: [
        'EloFix may suspend or remove Provider access for policy violations, safety concerns, poor performance, fraud, or legal risk.',
        'You may deactivate your account subject to completion of outstanding Jobs, payment obligations, and dispute resolution requirements.',
      ],
    },
    {
      id: 'updates',
      title: '12. Updates',
      content: [
        'We may update this Provider Agreement from time to time. Material changes may require renewed acceptance before you continue accepting new Jobs.',
      ],
    },
  ],
};

export const refundPolicy: LegalDocument = {
  id: 'refund-policy',
  title: 'Refund and Cancellation Policy',
  subtitle: 'How cancellations, refunds, and adjustments work on EloFix.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.refundPolicy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        'This policy describes how cancellations and refunds are handled for service Jobs, labor charges, platform fees, and material orders arranged through EloFix (Pty) Ltd.',
        'Specific refund eligibility depends on Job status, payment timing, Provider acceptance, supplier fulfilment stage, escrow release stage, and applicable South African law including the Consumer Protection Act.',
        'For payment holds and staged releases, see the Escrow and Payment Protection Policy. For completion disputes, see the Dispute Resolution Policy.',
      ],
    },
    {
      id: 'service-cancellations',
      title: '2. Service Job Cancellations',
      content: [
        'Customers may cancel a Job before a Provider begins work subject to any displayed cancellation terms at checkout or quote acceptance.',
        'If labor has not been paid, cancellation typically results in no labor charge.',
        'If labor has been paid but no provider share has been released, the Customer may receive a full gross labor refund.',
        'If the first escrow tranche (approximately 50% of the provider share) has been released, cancellation refunds are limited to the remaining held escrow amount — not the full original payment.',
        'Once work has started, refunds are generally limited to documented incomplete work, Platform-verified service failures, or admin resolution through the Dispute Resolution Policy.',
      ],
    },
    {
      id: 'en-route-forfeiture',
      title: '3. En-Route Cancellation (Customer)',
      content: [
        'If a Provider is en route or work is actively in progress (including IN_PROGRESS or AWAITING_CONFIRMATION status, or active courier delivery states), and the Customer cancels, the Customer may forfeit the labor payment and receive R0 refund.',
        'This rule applies where the Provider has already incurred travel, preparation, or commencement costs.',
        'If the Provider cancels while en route without valid reason, the Customer may receive a full labor refund.',
      ],
    },
    {
      id: 'provider-cancellations',
      title: '4. Provider Cancellations',
      content: [
        'Providers should avoid cancellations after acceptance. Repeated cancellations may affect account standing, trust score, visibility, and payout eligibility.',
        'If a Provider cancels without valid reason, EloFix may assist the Customer with reassignment, credits, or refunds where appropriate.',
      ],
    },
    {
      id: 'material-orders',
      title: '5. Material Orders',
      content: [
        'Material orders may be cancelled before supplier acceptance or preparation begins, subject to supplier policies.',
        'Custom, special-order, delivered, or installed materials may not be refundable once fulfilment has progressed.',
        'Delivery issues, incorrect items, or damaged goods should be reported promptly through the Platform so EloFix and suppliers can investigate.',
        'Material payments are settled to suppliers on confirmation and are not held in job-completion escrow. Refund eligibility depends on fulfilment stage.',
      ],
    },
    {
      id: 'refund-process',
      title: '6. Refund Process',
      content: [
        'Approved refunds are returned to the original payment method where possible.',
        'Processing times vary by payment provider and bank, typically within 5–10 business days after approval.',
        'EloFix may issue account credits instead of cash refunds when permitted by policy or requested by the user.',
        'Platform commission on labor is not refunded to Providers on partial labor refunds processed through admin dispute resolution.',
      ],
    },
    {
      id: 'disputes',
      title: '7. Disputes and Refunds',
      content: [
        'Customers may open a dispute during the Job completion verification window. See the Dispute Resolution Policy for full procedures.',
        'Requesting a refund in a dispute does not automatically trigger a refund. EloFix administrators investigate and may order full refund, partial refund, release of funds, return for corrective work, or case closure.',
        'Open disputes freeze release of the remaining escrow tranche until resolved.',
      ],
    },
    {
      id: 'auto-acceptance',
      title: '8. Automatic Acceptance',
      content: [
        'If a Customer does not accept or dispute completed work within 7 calendar days, the Job may be automatically approved under the Job Completion Verification Policy.',
        'Automatic acceptance releases the remaining escrow tranche and closes the transaction. The Customer is deemed to have accepted the work quality by failing to respond within the verification window.',
      ],
    },
    {
      id: 'chargebacks',
      title: '9. Chargebacks',
      content: [
        'Initiating a chargeback without first using Platform support may delay resolution and affect account access.',
        'Providers and suppliers may be debited for chargebacks, refunds, or adjustments associated with their Jobs or orders.',
      ],
    },
    {
      id: 'non-refundable',
      title: '10. Non-Refundable Items',
      content: [
        'Completed services properly delivered and accepted (including by automatic acceptance), non-returnable materials, third-party fees already incurred, and applicable platform service fees may be non-refundable except where required by the CPA or other mandatory law.',
      ],
    },
    {
      id: 'changes',
      title: '11. Policy Changes',
      content: [
        'We may update this policy from time to time. The effective date and version on this page indicate the current policy in effect.',
      ],
    },
    {
      id: 'contact',
      title: '12. Contact',
      content: [
        'Refund and cancellation questions may be sent to support@elofix.com with your Job or order reference number.',
      ],
    },
  ],
};
