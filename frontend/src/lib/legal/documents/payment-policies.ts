import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';

const EFFECTIVE = 'June 24, 2026';

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
        'This policy describes the process by which Providers mark Jobs as complete and Customers verify completed work on EloFix (Pty) Ltd.',
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
        'Questions about job completion verification: support@elofix.com.',
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
        'This policy describes how EloFix (Pty) Ltd facilitates Customer payments to Providers and Suppliers according to transparent payment schedules for each service or order type.',
        'EloFix is a marketplace facilitator, not a bank, deposit-taker, or escrow agent. EloFix does not hold Customer funds as deposits and does not guarantee Provider or Supplier earnings.',
        'Settlement is processed through third-party licensed payment providers (including PayFast, Payflex, and PayJustNow). Whether any arrangement is treated as escrow or another regulated payment activity under South African law depends on the licensed provider\'s product and requires appropriate legal advice. This document is informational platform policy only and is not legal advice or a claim of regulatory approval.',
      ],
    },
    {
      id: 'labor-payment-schedule',
      title: '2. Labor Payment Schedules',
      content: [
        'When a Customer pays for labor on a Job, EloFix collects the gross labor amount through a licensed payment partner.',
        'EloFix retains a platform commission of 7% of the gross labor amount. The Provider share is 93% of gross.',
        'Flexible payment options apply by service category:',
        'Staged (two-stage) payments — Selected services: approximately 50% of the Provider share is payable as a mobilisation payment when labor payment is confirmed and the Provider may commence work; the remaining approximately 50% is payable upon Customer confirmation of completed work, administrator release, or automatic acceptance after the 7-day verification window under the Job Completion Verification Policy.',
        'Single payment — Some services use a single payment, depending on the service category, as shown at checkout and in the Job details.',
        'Provider workflow: receive requests → quote → receive the applicable payment for that category model → perform work → request completion → receive any remaining payment where applicable.',
      ],
    },
    {
      id: 'material-payments',
      title: '3. Material and Supplier Payments',
      content: [
        'Material order payments are subject to a 7% platform commission on the materials subtotal. The supplier earning is the subtotal minus commission.',
        'Material payments are settled to Suppliers upon payment confirmation according to the supplier payment schedule and are not subject to job-completion staged holds.',
        'Delivery fees are processed as separate payment intents and follow their own settlement timing with the payment partner.',
      ],
    },
    {
      id: 'customer-transparency',
      title: '4. Customer Transparency',
      content: [
        'Customers see the applicable payment model (staged or single) before confirming payment for a Job.',
        'For staged Jobs, Customers may dispute completed work within the 7-day verification window, which may pause final tranche settlement pending investigation.',
        'Cancellation refunds follow the Refund and Cancellation Policy, including en-route forfeiture rules where applicable.',
      ],
    },
    {
      id: 'provider-transparency',
      title: '5. Provider Transparency',
      content: [
        'Providers receive the mobilisation tranche (where applicable) upon confirmed labor payment, according to the category payment model shown on the Job.',
        'Any remaining tranche becomes payable upon Customer acceptance, automatic acceptance, or admin resolution in the Provider\'s favour.',
        'EloFix does not promise to hold, safeguard, or guarantee Provider money. Timing of settlement depends on the licensed payment partner and Platform status rules (including open disputes).',
        'Final staged tranches generally do not settle while an open dispute exists, except by administrator decision.',
      ],
    },
    {
      id: 'elofix-rights',
      title: '6. EloFix Rights and Commission',
      content: [
        'EloFix retains the 7% platform commission on confirmed labor and material transactions.',
        'EloFix may delay, withhold instructions for, or reverse payouts for fraud review, chargebacks, policy violations, open disputes, or legal compliance, subject to payment-partner capabilities.',
        'Commission is not refunded to Providers on labor refunds processed through dispute resolution.',
        'When refund recovery from a Provider is required, EloFix may stage Customer refunds: amounts immediately recoverable first, with any remainder paid as Provider debt is recovered within approximately 30 days.',
      ],
    },
    {
      id: 'cancellation-refunds',
      title: '7. Cancellation and Refund Impact on Payment Schedules',
      content: [
        'Before any provider share is released: net labor refund to Customer (93% of gross), subject to payment-partner processing.',
        'After a mobilisation tranche is released on a staged Job: refund may be limited to any remaining unsettled balance plus recoverable provider amounts; any shortfall is recovered from the Provider over up to 30 days.',
        'Admin partial or full refunds through dispute resolution may trigger provider clawback from unsettled balances, available earnings, or recorded refund debt as applicable.',
      ],
    },
    {
      id: 'disputes',
      title: '8. Disputes and Payment Pause',
      content: [
        'When a Customer opens a dispute, the labor payment intent is marked as disputed and any remaining staged tranche does not settle until the dispute is resolved.',
        'Administrator outcomes may include full refund, partial refund, release of remaining payment, return for corrective work, or case closure. See the Dispute Resolution Policy.',
      ],
    },
    {
      id: 'limitation',
      title: '9. Limitation of Liability',
      content: [
        'EloFix is not liable for failures, delays, or errors of payment partners, banks, or card networks.',
        'EloFix does not guarantee that Providers or Suppliers will perform to Customer expectations, and does not guarantee that payments will settle on any particular date beyond what the payment partner facilitates.',
        'To the maximum extent permitted by South African law, EloFix\'s aggregate liability for payment-schedule-related claims is limited to the greater of platform fees paid by you in the prior 12 months or R1,500, except where prohibited by the CPA, ECTA, or other mandatory law.',
        'Nothing in this policy limits mandatory consumer rights under South African law.',
      ],
    },
    {
      id: 'contact',
      title: '10. Contact',
      content: [
        'Payment schedule questions: support@elofix.com.',
      ],
    },
  ],
};
