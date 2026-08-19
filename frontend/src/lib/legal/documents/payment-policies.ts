import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';
import { COMPANY, LEGAL_OPERATOR_INTRO } from '../../company';

const EFFECTIVE = 'August 18, 2026';

export const jobCompletionVerification: LegalDocument = {
  id: 'job-completion-verification',
  title: 'Job Completion Verification Policy',
  subtitle: 'How Customers verify completed work and how Jobs are closed on EloFix.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.jobCompletionVerification,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes the process by which Providers mark Jobs as complete and Customers verify completed work on the EloFix Platform, operated by ${COMPANY.legalName}.`,
        LEGAL_OPERATOR_INTRO,
        'It forms part of the Payment Schedule and Transparency Policy and governs when the final provider payment tranche may become payable for staged-payment Jobs.',
      ],
    },
    {
      id: 'provider-marks-complete',
      title: '2. Provider Marks Job Complete',
      content: [
        'When a Provider determines that service work is finished, they mark the Job as complete through the Platform.',
        'The Job status changes to Awaiting Confirmation. The Customer receives a notification that the Provider has completed the work.',
        'The Platform records the completion timestamp (markedCompleteAt) and sets a confirmation deadline of 7 calendar days from that moment (confirmationDeadlineAt).',
        'The Provider receives notification that the Job is awaiting Customer confirmation.',
      ],
    },
    {
      id: 'customer-inspection',
      title: '3. Customer Inspection Period',
      content: [
        'The Customer has 7 calendar days from the completion timestamp to inspect the work on-site or through agreed means.',
        'During this period, the Customer may either accept the work or open a dispute.',
        'The Customer should review the work promptly and report any concerns before the deadline expires.',
      ],
    },
    {
      id: 'manual-acceptance',
      title: '4. Manual Acceptance',
      content: [
        'To manually accept completed work, the Customer must submit a star rating (1 to 5), at least one photo or video of the completed work, and may include a written review.',
        'Upon acceptance: the Job is marked Completed, completion evidence is stored, a Provider review may be published, any remaining payment tranche for a staged-payment Job becomes payable to the Provider according to the Payment Schedule and Transparency Policy, and the transaction is closed.',
        'Written reviews may be edited within 10 minutes of first submission.',
        'Manual acceptance cannot occur while an open dispute exists on the Job.',
      ],
    },
    {
      id: 'dispute-option',
      title: '5. Dispute Option',
      content: [
        'If the Customer is not satisfied with the completed work, they may open a dispute during the 7-day verification window.',
        'Disputes are handled under the Dispute Resolution Policy. Opening a dispute blocks automatic acceptance and may pause release of any remaining payment tranche until the dispute is resolved.',
      ],
    },
    {
      id: 'automatic-acceptance',
      title: '6. Automatic Acceptance (Silence = Acceptance)',
      content: [
        'If the Customer does not accept or dispute the completed work within 7 calendar days, the Job is automatically approved by the Platform.',
        'Upon automatic acceptance: the Job is marked Completed, any remaining payment tranche for a staged-payment Job becomes payable to the Provider according to the Payment Schedule and Transparency Policy, and the transaction is closed.',
        'The Customer acknowledges that failure to respond within the 7-day verification window constitutes acceptance of the work quality as completed by the Provider.',
        'Automatic acceptance does not require the Customer to submit a rating, review, or media. No public star review is created. A neutral trust score adjustment may apply to the Provider.',
        'Automatic acceptance does not occur if an open dispute exists or if completion evidence or final payment release has already been processed for the Job.',
      ],
    },
    {
      id: 're-completion',
      title: '7. Re-Completion After Corrective Work',
      content: [
        'If a Provider is instructed to return for corrective work under the Corrective Work Policy, the completion verification process restarts when the Provider re-marks the Job as complete.',
        'A new 7-day Customer verification window applies from the new completion timestamp.',
      ],
    },
    {
      id: 'contact',
      title: '8. Contact',
      content: [
        `Questions about job completion verification: ${COMPANY.email}.`,
      ],
    },
  ],
};

export const escrowPolicy: LegalDocument = {
  id: 'escrow-policy',
  title: 'Payment Schedule and Transparency Policy',
  subtitle: 'How payment schedules, staging, and settlement work for Jobs and orders on EloFix.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.escrowPolicy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes how ${COMPANY.legalName}, operating the EloFix Platform, facilitates Customer payments to Providers and Suppliers according to transparent payment schedules for each service or order type.`,
        LEGAL_OPERATOR_INTRO,
        'EloFix is a marketplace facilitator, not a bank, deposit-taker, or escrow agent. EloFix does not hold Customer funds as deposits and does not guarantee Provider or Supplier earnings.',
        'Customer payments are processed through third-party payment service providers. EloFix records applicable transaction information, platform commissions, and recipient shares. Actual settlement to a Provider or Supplier bank account depends on the supported payment service provider and settlement configuration. Whether any arrangement is treated as escrow or another regulated payment activity under South African law depends on the licensed provider\'s product and requires appropriate legal advice. This document is informational platform policy only and is not legal advice or a claim of regulatory approval.',
      ],
    },
    {
      id: 'labor-payment-schedule',
      title: '2. Labor Payment Schedules',
      content: [
        'When a Customer pays for labor on a Job, the gross labor amount for that collected tranche is processed through the applicable payment service provider.',
        'The current contractual EloFix platform commission is 7% of each collected customer labor payment tranche. The Provider share is 93% of that collected tranche and is recorded in EloFix\'s financial ledger.',
        'Customer payment timing is not the same as provider settlement timing. A recorded or payable share is not automatically a cash deposit into the Provider\'s bank account.',
        'Not all Jobs use escrow. EloFix does not hold all provider shares, and EloFix is not a deposit-taking escrow agent.',
        'The Platform supports three live labor payment modes. The applicable mode is shown at checkout and in the Job details:',
        'TWO_PAYMENT_50_50 — the Customer pays a first payment of approximately 50% of the service amount, then a remaining completion payment according to the Job workflow. Commission of 7% applies to each collected customer payment tranche.',
        'SINGLE_PAYMENT_UPFRONT — the Customer pays the full service amount upfront before work progresses. Commission of 7% applies to that collected payment.',
        'SINGLE_PAYMENT_ON_COMPLETION — the Customer does not pay labor upfront. Payment becomes due after the configured completion or confirmation flow. Commission of 7% applies when that payment is collected.',
        'Provider workflow: receive requests → quote → receive the applicable customer payment for that category model where due → perform work → request completion → receive any remaining recorded share where applicable.',
      ],
    },
    {
      id: 'material-payments',
      title: '3. Material and Supplier Payments',
      content: [
        'Material order payments are subject to a 7% platform commission on the materials subtotal. The supplier earning is the subtotal minus commission and is recorded after payment confirmation.',
        'Material payments are not subject to job-completion staged payment holds. Where supported by EloFix\'s payment service provider and applicable settlement configuration, eligible Supplier or branch funds may be settled to a nominated verified bank account. EloFix does not promise automatic bank settlement where marketplace settlement is not supported.',
        'Delivery fees are processed as separate payment intents and follow their own timing with the payment service provider.',
      ],
    },
    {
      id: 'customer-transparency',
      title: '4. Customer Transparency',
      content: [
        'Customers see the applicable payment model (TWO_PAYMENT_50_50, SINGLE_PAYMENT_UPFRONT, or SINGLE_PAYMENT_ON_COMPLETION) before confirming payment for a Job.',
        'For TWO_PAYMENT_50_50 Jobs, Customers may dispute completed work within the 7-day verification window, which may pause the remaining customer payment pending investigation.',
        'If an outstanding customer service balance becomes payable, the Customer must settle it within 30 calendar days. Failure to settle an outstanding amount within 30 calendar days may result in restrictions on new marketplace transactions, account suspension or blocking, referral for lawful debt recovery, and further legal action where appropriate.',
        'Cancellation refunds follow the Refund, Returns & Cancellation Policy. Courier en-route forfeiture, where implemented, is separate from ordinary service cancellation review.',
      ],
    },
    {
      id: 'provider-transparency',
      title: '5. Provider Transparency',
      content: [
        'Providers see the mobilisation tranche (where applicable) become payable upon confirmed labor payment, according to the category payment model shown on the Job.',
        'Any remaining tranche becomes payable upon Customer acceptance, automatic acceptance, or admin resolution in the Provider\'s favour.',
        'EloFix does not promise to hold, safeguard, or guarantee Provider money as deposits. Timing of any bank settlement depends on the payment service provider and Platform status rules (including open disputes).',
        'Final staged tranches generally do not become payable for settlement while an open dispute exists, except by administrator decision.',
      ],
    },
    {
      id: 'elofix-rights',
      title: '6. EloFix Rights and Commission',
      content: [
        'EloFix retains the current contractual 7% platform commission on confirmed labor and material transactions.',
        'EloFix may delay, withhold instructions for, or reverse settlement steps for fraud review, chargebacks, policy violations, open disputes, or legal compliance, subject to payment-service-provider capabilities.',
        'Commission is not refunded to Providers on labor refunds processed through dispute resolution.',
        'When refund recovery from a Provider is required, Customer refunds follow the Refund, Returns & Cancellation Policy: provider repayment where required, admin verification, then payment-service-provider refund processing (which may complete, require manual processing, or fail).',
      ],
    },
    {
      id: 'cancellation-refunds',
      title: '7. Cancellation and Refund Impact on Payment Schedules',
      content: [
        'Before provider amounts become payable under the schedule: net labor refund to Customer (93% of eligible paid gross), subject to payment-service-provider processing and confirmation.',
        'After a first tranche has become payable on a TWO_PAYMENT_50_50 Job: refund may be limited to any remaining unsettled balance plus recoverable provider amounts; any shortfall is recovered from the Provider over up to 30 calendar days.',
        'Admin partial or full refunds through dispute resolution may trigger provider clawback from unsettled balances, recorded earnings, or recorded refund debt as applicable.',
      ],
    },
    {
      id: 'disputes',
      title: '8. Disputes and Payment Pause',
      content: [
        'When a Customer opens a dispute, the labor payment intent is marked as disputed and any remaining staged tranche does not become payable for settlement until the dispute is resolved.',
        'Administrator outcomes may include full refund, partial refund, release of remaining payment, return for corrective work, or case closure. See the Dispute Resolution Policy.',
      ],
    },
    {
      id: 'limitation',
      title: '9. Limitation of Liability',
      content: [
        'EloFix is not liable for failures, delays, or errors of payment service providers, banks, or card networks.',
        'EloFix does not guarantee that Providers or Suppliers will perform to Customer expectations, and does not guarantee that payments will settle on any particular date beyond what the payment service provider facilitates.',
        'To the maximum extent permitted by South African law, EloFix\'s aggregate liability for payment-schedule-related claims is limited to the greater of platform fees paid by you in the prior 12 months or R1,500, except where prohibited by the CPA, ECTA, or other mandatory law.',
        'Nothing in this policy limits mandatory consumer rights under South African law.',
      ],
    },
    {
      id: 'contact',
      title: '10. Contact',
      content: [
        `Payment schedule questions: ${COMPANY.email}.`,
      ],
    },
  ],
};
