import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';
import { COMPANY, LEGAL_OPERATOR_INTRO } from '../../company';

const EFFECTIVE = 'August 18, 2026';

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
        LEGAL_OPERATOR_INTRO,
        'This Provider Agreement supplements the EloFix Terms of Service for users who register as Providers.',
        `You acknowledge that you are an independent contractor and not an employee, agent, joint venturer, or partner of ${COMPANY.legalName}.`,
        'You control how you perform services, subject to Customer requirements, applicable South African law, and Platform standards.',
        'You are responsible for your own tax, UIF, COIDA, and statutory obligations as an independent service provider.',
      ],
    },
    {
      id: 'onboarding',
      title: '2. Onboarding and Verification',
      content: [
        'You must complete profile setup, submit required verification documents, and receive approval before accepting paid Jobs, as described in the Provider Verification Policy.',
        'Required documents may include South African ID, business registration, proof of address, banking information for a settlement destination profile, and optional certifications.',
        'Saving banking details does not mean settlement is enabled, that a payout destination is verified with a payment service provider, or that EloFix may debit your bank account.',
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
      title: '5. Payments and Settlement',
      content: [
        'Customer labor payments are processed through EloFix\'s applicable third-party payment service providers. EloFix records the current contractual platform commission of 7% of each collected customer labor payment tranche and your provider share (93% of that collected tranche) according to the Payment Schedule and Transparency Policy.',
        'Recording your share in EloFix\'s ledger is not the same as depositing cash into your bank account. Customer payment timing is not the same as provider settlement timing. Where supported by EloFix\'s payment service provider and applicable settlement configuration, eligible provider funds may be settled to your nominated verified bank account.',
        'The Platform supports three live labor payment modes, as shown on the Job:',
        'TWO_PAYMENT_50_50 — the Customer pays an approximately 50% first tranche, then a remaining completion tranche according to the Job workflow. Commission of 7% applies to each collected customer payment tranche.',
        'SINGLE_PAYMENT_UPFRONT — the Customer pays the full service amount before work progresses.',
        'SINGLE_PAYMENT_ON_COMPLETION — the Customer does not pay labor upfront. Payment becomes due after the configured completion or confirmation flow.',
        'Not all Jobs use escrow. EloFix does not hold all provider shares as deposits.',
        'Settlement timing and eligibility may be delayed or paused for fraud review, open disputes, chargebacks, policy violations, incomplete verification, overdue refund repayment, or legal compliance, subject to payment-service-provider capabilities.',
        'You authorize EloFix to deduct applicable platform fees, refunds, clawbacks, adjustments, and chargebacks from amounts otherwise recorded as payable to you.',
        'If a Customer refund requires recovery from you after amounts attributable to you have already been accounted for or paid out, you must complete provider repayment within 30 calendar days through the supported mechanisms (gateway repayment checkout where available, and/or bank transfer / EFT using the reference EloFix provides). Failure to settle an approved refund repayment or other recoverable amount within 30 calendar days may result in restrictions on new work, settlement restrictions, account blocking, referral for lawful debt recovery, and further legal action where appropriate. You may still log in, view Jobs and earnings, access the repayment page, submit repayment, and contact EloFix. Entering banking details does not authorize EloFix to debit your bank account automatically unless a payment service provider expressly supports that capability and you are notified of such terms.',
      ],
    },
    {
      id: 'job-completion',
      title: '6. Job Completion and Customer Verification',
      content: [
        'When you mark a Job as complete, the Customer receives notification and has 7 calendar days to accept or dispute the work under the Job Completion Verification Policy.',
        'If the Customer does not respond within 7 days, the Job may be automatically approved and any remaining payment tranche for a staged-payment Job may become payable according to the Payment Schedule and Transparency Policy.',
        'Open disputes block automatic acceptance and may pause settlement of any remaining staged payment tranche until resolved.',
      ],
    },
    {
      id: 'materials-delivery',
      title: '7. Materials and Delivery',
      content: [
        'When you recommend or fulfil materials, you must ensure accuracy of specifications and comply with supplier and delivery policies, including the Delivery & Collection Policy.',
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
  title: 'Refund, Returns & Cancellation Policy',
  subtitle: 'How cancellations, refunds, returns, and adjustments work for EloFix services and material orders.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.refundPolicy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        LEGAL_OPERATOR_INTRO,
        `This policy describes how cancellations, refunds, returns, and adjustments are handled for service Jobs and material orders arranged through the EloFix Platform operated by ${COMPANY.legalName}.`,
        'This policy distinguishes service transactions (labor Jobs with independent Providers) from material orders (goods from independent Suppliers).',
        'Specific refund eligibility depends on Job or order status, which payment amounts the Customer has actually paid, Provider acceptance, supplier fulfilment stage, payment-schedule status, and applicable South African law including the Consumer Protection Act.',
        'An unpaid payment tranche is not treated as money already paid by the Customer. Refunds are based on eligible paid amounts, not the full original quotation where only a deposit or partial amount was paid.',
        'For payment schedules and settlement rules, see the Payment Schedule and Transparency Policy. For completion disputes, see the Dispute Resolution Policy. For collection and delivery modes, see the Delivery & Collection Policy.',
      ],
    },
    {
      id: 'service-before-work',
      title: '2. Service Transactions — Cancellation Before Work',
      content: [
        'Customers may cancel a Job before a Provider begins work subject to any displayed cancellation terms at checkout or quote acceptance.',
        'If labor has not been paid, cancellation typically results in no labor charge.',
        'If labor has been paid and amounts attributable to the Provider have not yet been treated as payable or settled under the applicable payment schedule, the Customer may receive a labor refund calculated on the eligible paid amount, net of the platform commission (93% of gross labor paid). The 7% platform fee is not refunded.',
        'If a mobilisation or other provider tranche has already become payable or been accounted for under the payment schedule, cancellation refunds are limited to remaining eligible unpaid or recoverable amounts — not necessarily the full original quotation or total paid amount.',
      ],
    },
    {
      id: 'service-after-work',
      title: '3. Service Transactions — Cancellation After Work Starts',
      content: [
        'Once work has started on a standard service Job, a Customer cancellation of paid work does not automatically forfeit the paid amount and does not automatically produce a R0 refund.',
        'If labor has been paid and the Customer cancels after work has started, EloFix may open an administrator review or cancellation dispute. A refund is not guaranteed. An administrator determines the outcome according to the circumstances, the Job records, and eligible paid amounts.',
        'Unpaid payment tranches are not automatically charged merely because a cancellation or review was opened. Only eligible paid amounts can be considered for refund.',
        'Administrators may resolve a cancellation review using the existing dispute outcomes described in the Dispute Resolution Policy (including refund, partial refund, release of remaining payment, return for corrective work, or case closure).',
        'Courier and moving Jobs follow separate hard cancellation rules in Section 3A and in the Delivery & Collection Policy. Those courier rules are not the same as ordinary service cancellation.',
      ],
    },
    {
      id: 'paid-unpaid-tranches',
      title: '4. Service Transactions — Paid vs Unpaid Payment Tranches',
      content: [
        'EloFix does not treat an unpaid payment tranche as money already paid by the Customer.',
        'For staged-payment Jobs, a mobilisation tranche and a completion tranche may apply as shown at checkout and in the Job details. Only amounts the Customer has actually paid are eligible for refund consideration.',
        'Unpaid remaining tranches are not refunded because they have not been collected. They may simply not become payable if the Job is cancelled or resolved without that tranche becoming due.',
        'Refund calculations on paid labor follow the Payment Schedule and Transparency Policy and the processing rules in this policy.',
      ],
    },
    {
      id: 'courier-cancellation',
      title: '4A. Courier and Moving Jobs — Cancellation Restrictions',
      content: [
        'Courier and moving Jobs have separate cancellation rules from ordinary service Jobs.',
        'A Customer generally cannot cancel a courier or moving Job after items have been collected (picked up), or while the Job is awaiting completion confirmation.',
        'While a courier Provider is collecting items and labor has been paid, Customer cancellation may result in no labor refund (R0) under the en-route forfeiture rule implemented on the Platform.',
        'These courier restrictions remain even where ordinary service cancellation would instead open an administrator review.',
        'Material-order refunds, if any, remain subject to the material-order rules in this policy and the Delivery & Collection Policy.',
      ],
    },
    {
      id: 'provider-cancellations',
      title: '5. Provider Cancellations',
      content: [
        'Providers should avoid cancellations after acceptance. Repeated cancellations may affect account standing, trust score, visibility, and settlement eligibility.',
        'If a Provider cancels without valid reason, EloFix may assist the Customer with reassignment or a refund of eligible paid amounts where appropriate. EloFix does not issue account credits, store credit, wallet credit, or EloFix credit.',
      ],
    },
    {
      id: 'incomplete-defective',
      title: '6. Incomplete or Defective Work',
      content: [
        'If work is incomplete, defective, or not as agreed, the Customer should use the Job completion verification window and, where eligible, the Dispute Resolution Policy rather than a card chargeback as a first step.',
        'Administrators may order a full refund, partial refund, release of remaining payment, return for corrective work, or case closure, based on Platform records and submitted evidence.',
        'Corrective work is described in the Corrective Work Policy and does not automatically create an additional labor charge unless separately agreed through Platform flows.',
      ],
    },
    {
      id: 'disputes',
      title: '7. Disputes',
      content: [
        'Customers may open a completion dispute while the Job is in Awaiting Confirmation, as described in the Dispute Resolution Policy.',
        'A cancellation request on an eligible Job may also open an administrator dispute or review from other Job statuses. Not all disputes are limited to Awaiting Confirmation.',
        'Requesting a refund in a dispute does not automatically trigger a refund. EloFix administrators investigate and may order full refund, partial refund, release of remaining payment, return for corrective work, or case closure.',
        'Open disputes may pause settlement of any remaining staged payment tranche until resolved.',
        'When part of an approved refund must be recovered from a Provider, that portion is not guaranteed instantly. The Provider has 30 calendar days to complete repayment via supported gateway repayment and/or bank transfer / EFT (and/or recovery from future earnings where applicable) before account restrictions on new work may apply.',
        'Failure to settle an approved refund repayment or other recoverable amount within 30 calendar days may result in restrictions on new work, settlement restrictions, account blocking, referral for lawful debt recovery, and further legal action where appropriate.',
      ],
    },
    {
      id: 'material-cancellations',
      title: '8. Material Orders — Cancellations',
      content: [
        'Material orders may be cancelled by the Customer while the order is still pending, accepted, being prepared, or ready for collection, subject to supplier policies and Platform status rules.',
        'Customer cancellation is generally not available after the order has been dispatched or is out for delivery.',
        'Custom, special-order, cut-to-size, delivered, or installed materials may not be refundable once fulfilment has progressed.',
        'If a supplier cancels an order, refund treatment follows Platform accounting for that cancellation type, including commission reversals where the Platform applies them.',
        'Material payments are processed through the applicable payment service provider. Supplier share is recorded after commission accounting and is not subject to job-completion staged payment holds. Actual bank settlement to a Supplier or branch depends on supported marketplace settlement configuration.',
      ],
    },
    {
      id: 'material-incorrect-damaged',
      title: '9. Material Orders — Incorrect, Damaged, Defective, or Unavailable Goods',
      content: [
        'Incorrect goods: if items received do not match the order, report the issue through the Platform after fulfilment is marked complete and before confirming receipt, using the delivery-issue process where available.',
        'Damaged goods: report broken or damaged items through the same Platform process, with photographs or other evidence where requested.',
        'Defective goods: quality or manufacturing defects should be reported through the Platform so the supplier can investigate. The supplier remains responsible for the goods they supply, subject to the Supplier Agreement and applicable law.',
        'Unavailable goods: if items cannot be fulfilled because they are out of stock or otherwise unavailable, the supplier should update the order through the Platform. Cancellation or substitution then follows Platform status and any confirmation shown to the Customer.',
        'EloFix facilitates reporting and related records. EloFix is not the seller of the goods.',
      ],
    },
    {
      id: 'material-returns-exchanges',
      title: '10. Material Orders — Returns and Exchanges',
      content: [
        'Returns and exchanges, where offered, are handled with the fulfilling supplier through the Platform and any instructions displayed on the order or at checkout.',
        'EloFix does not publish a statutory cooling-off period, restocking fee, or universal return window on this page. Any return timing, condition requirements, or costs are as displayed at checkout or as confirmed with the supplier on the Platform.',
        'Not all goods are returnable. Custom, special-order, cut, mixed, hazardous, perishable, or installed items may be excluded by the supplier or by the nature of the goods.',
        'An exchange is not guaranteed. Where a supplier agrees to an exchange, it is an arrangement between the Customer and that supplier, recorded through the Platform where those tools exist.',
        'Any return-shipping or collection cost is as displayed or as confirmed with the supplier. This policy does not invent a fee or a free-return promise.',
      ],
    },
    {
      id: 'material-delivery-returns',
      title: '11. Material Orders — Delivery-Related Return Issues',
      content: [
        'Delivery-related issues (missing items, damaged items, wrong items, goods not received, or other problems described on the Platform form) should be reported promptly after fulfilment is marked complete and before the Customer confirms receipt.',
        'Reporting notifies the relevant supplier branch so the matter can be investigated. A delivery-issue report may block receipt confirmation until handled according to Platform processes.',
        'Outcomes may include investigation, replacement, return, partial refund, full refund, or no adjustment, depending on evidence, fulfilment stage, and applicable law.',
        'Collection, store delivery, and courier delivery modes are described in the Delivery & Collection Policy. This section does not change those operational rules.',
      ],
    },
    {
      id: 'refund-process',
      title: '12. Refund Processing',
      content: [
        'Refunds follow Platform status steps. Typical statuses include: refund approved; refund processing; refund completed; refund requires manual processing; or refund could not be completed.',
        'Where provider repayment is required after an admin resolution, the Provider must complete repayment through a supported mechanism. After repayment is verified where required, the Customer refund may become ready for processing. An administrator then explicitly processes the Customer refund through the applicable payment service provider.',
        'A refund is described as returned to the original payment method only after the applicable payment service provider confirms the refund. Before confirmation, EloFix will show accurate processing status, including where manual processing by the payment service provider is required.',
        'Processing times vary by payment service provider and bank. EloFix does not promise instant or automatic refunds to a Customer\'s card or bank account.',
        'Customer labor refunds are calculated on eligible paid labor amounts, net of the platform commission (93% of gross labor paid). The 7% platform fee is not refunded.',
        'When part of an approved refund depends on recovering amounts from a Provider, that portion is not guaranteed instantly. EloFix processes the Customer refund as recovery and admin processing complete, within approximately 30 calendar days for the Provider repayment obligation where applicable.',
        'EloFix does not operate an account-credit, store-credit, wallet-credit, or EloFix-credit product. Supported refund outcomes are a refund to the original payment method where the payment service provider confirms it, manual processing where required, provider repayment or recovery, administrator review, and failed or manual statuses.',
        'Platform commission on labor is not refunded to Providers on labor refunds processed through admin dispute resolution.',
      ],
    },
    {
      id: 'auto-acceptance',
      title: '13. Automatic Acceptance',
      content: [
        'If a Customer does not accept or dispute completed work within 7 calendar days, the Job may be automatically approved under the Job Completion Verification Policy.',
        'Automatic acceptance may make any remaining customer payment tranche payable according to the Payment Schedule and Transparency Policy. Customer payment timing is not the same as provider bank settlement timing.',
      ],
    },
    {
      id: 'chargebacks',
      title: '14. Chargebacks',
      content: [
        'Initiating a chargeback without first using Platform support may delay resolution and affect account access.',
        'Providers and suppliers may be required to repay or otherwise settle chargebacks, refunds, or adjustments associated with their Jobs or orders through supported Platform repayment and accounting mechanisms. This does not mean EloFix can automatically debit a bank account unless a payment service provider expressly supports that capability.',
      ],
    },
    {
      id: 'non-refundable',
      title: '15. Non-Refundable Items',
      content: [
        'Completed services properly delivered and accepted (including by automatic acceptance), non-returnable materials, third-party fees already incurred, and applicable platform service fees may be non-refundable except where required by the CPA or other mandatory law.',
      ],
    },
    {
      id: 'outstanding-payments',
      title: '15A. Outstanding Customer Payments',
      content: [
        'If an administrator resolution or normal Job workflow makes an outstanding customer service balance payable, the Customer must settle that amount within 30 calendar days of the due date shown on the Platform.',
        'Until the due date, the Customer may continue to use the marketplace, subject to other Platform rules.',
        'If the amount remains unpaid after the due date, new marketplace transactions may be restricted. The Customer may still log in, view Jobs, disputes, invoices, and payment obligations, pay the outstanding amount, and contact EloFix.',
        'Failure to settle an outstanding amount within 30 calendar days may result in restrictions on new marketplace transactions, account suspension or blocking, referral for lawful debt recovery, and further legal action where appropriate.',
      ],
    },
    {
      id: 'changes',
      title: '16. Policy Changes',
      content: [
        'We may update this policy from time to time. The effective date and version on this page indicate the current policy in effect.',
      ],
    },
    {
      id: 'contact',
      title: '17. Contact',
      content: [
        `Refund, returns, and cancellation questions may be sent to ${COMPANY.email} with your Job or order reference number.`,
        `${COMPANY.operatorStatement} Country of domicile: ${COMPANY.country}.`,
      ],
    },
  ],
};
