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
        'It forms part of the Escrow and Payment Protection Policy and governs release of the final provider payment tranche.',
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
        'Upon acceptance: the Job is marked Completed, completion evidence is stored, a Provider review may be published, the remaining escrow tranche is released to the Provider, and the transaction is closed.',
        'Written reviews may be edited within 10 minutes of first submission.',
        'Manual acceptance cannot occur while an open dispute exists on the Job.',
      ],
    },
    {
      id: 'dispute-option',
      title: '5. Dispute Option',
      content: [
        'If the Customer is not satisfied with the completed work, they may open a dispute during the 7-day verification window.',
        'Disputes are handled under the Dispute Resolution Policy. Opening a dispute blocks automatic acceptance and freezes release of the remaining escrow tranche.',
      ],
    },
    {
      id: 'automatic-acceptance',
      title: '6. Automatic Acceptance (Silence = Acceptance)',
      content: [
        'If the Customer does not accept or dispute the completed work within 7 calendar days, the Job is automatically approved by the Platform.',
        'Upon automatic acceptance: the Job is marked Completed, the remaining escrow tranche is released to the Provider, and the transaction is closed.',
        'The Customer acknowledges that failure to respond within the 7-day verification window constitutes acceptance of the work quality as completed by the Provider.',
        'Automatic acceptance does not require the Customer to submit a rating, review, or media. No public star review is created. A neutral trust score adjustment may apply to the Provider.',
        'Automatic acceptance does not occur if an open dispute exists or if completion evidence or escrow release has already been processed for the Job.',
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
  title: 'Escrow and Payment Protection Policy',
  subtitle: 'How EloFix holds, releases, and protects payments for Jobs and orders.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.escrowPolicy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        'This policy describes how EloFix (Pty) Ltd temporarily holds Customer payments and releases funds to Providers and Suppliers through licensed payment partners.',
        'EloFix is a marketplace facilitator, not a bank or deposit-taker. Payment processing is provided by third-party gateways including PayFast, Payflex, and PayJustNow.',
      ],
    },
    {
      id: 'labor-escrow',
      title: '2. Labor Payment Escrow',
      content: [
        'When a Customer pays for labor on a Job, EloFix collects the gross labor amount through a licensed payment partner.',
        'EloFix retains a platform commission of 7% of the gross labor amount. The Provider share is 93% of gross.',
        'Provider payments are released in two stages:',
        'Stage 1 — Initial Release: Approximately 50% of the Provider share is released when labor payment is confirmed and the Provider may commence work.',
        'Stage 2 — Final Release: The remaining approximately 50% of the Provider share is released upon Customer confirmation of completed work, administrator release, or automatic acceptance after the 7-day verification window under the Job Completion Verification Policy.',
      ],
    },
    {
      id: 'material-payments',
      title: '3. Material and Supplier Payments',
      content: [
        'Material order payments are subject to a 7% platform commission on the materials subtotal. The supplier earning is the subtotal minus commission.',
        'Material payments are settled to Suppliers upon payment confirmation and are not held in job-completion escrow.',
        'Delivery fees are processed as separate payment intents and are not subject to job-completion escrow holds.',
      ],
    },
    {
      id: 'customer-protection',
      title: '4. Customer Protections',
      content: [
        'Customer labor funds remain partially held in escrow until the Job completion verification process concludes or a dispute is resolved.',
        'Customers may dispute completed work within the 7-day verification window, which freezes final release pending investigation.',
        'Cancellation refunds follow the Refund and Cancellation Policy, including en-route forfeiture rules where applicable.',
      ],
    },
    {
      id: 'provider-protection',
      title: '5. Provider Protections',
      content: [
        'Providers receive the initial escrow tranche upon confirmed labor payment, allowing them to commence work with partial payment security.',
        'Final tranche release occurs upon Customer acceptance, automatic acceptance, or admin resolution in the Provider\'s favour.',
        'EloFix does not release final tranches while an open dispute exists, except by administrator decision.',
      ],
    },
    {
      id: 'elofix-rights',
      title: '6. EloFix Rights and Commission',
      content: [
        'EloFix retains the 7% platform commission on confirmed labor and material transactions.',
        'EloFix may delay, withhold, or reverse payouts for fraud review, chargebacks, policy violations, open disputes, or legal compliance.',
        'Commission is not refunded to Providers on labor refunds processed through dispute resolution.',
        'When refund recovery from a Provider is required, EloFix may stage Customer payouts: immediate refund from held funds, with the remainder paid as Provider debt is recovered within approximately 30 days.',
      ],
    },
    {
      id: 'cancellation-refunds',
      title: '7. Cancellation and Refund Impact on Escrow',
      content: [
        'Before any provider share is released: net labor refund to Customer (93% of gross).',
        'After the first tranche is released: refund limited to remaining held escrow plus recoverable provider balance; any shortfall is recovered from the Provider over up to 30 days.',
        'Admin partial or full refunds through dispute resolution trigger provider clawback from escrow, available earnings, or recorded refund debt as applicable.',
      ],
    },
    {
      id: 'disputes',
      title: '8. Disputes and Escrow Freeze',
      content: [
        'When a Customer opens a dispute, the labor payment intent is marked as disputed and the second escrow tranche does not release until the dispute is resolved.',
        'Administrator outcomes may include full refund, partial refund, release of funds, return for corrective work, or case closure. See the Dispute Resolution Policy.',
      ],
    },
    {
      id: 'limitation',
      title: '9. Limitation of Liability',
      content: [
        'EloFix is not liable for failures, delays, or errors of payment partners, banks, or card networks.',
        'EloFix does not guarantee that Providers or Suppliers will perform to Customer expectations.',
        'To the maximum extent permitted by South African law, EloFix\'s aggregate liability for escrow-related claims is limited to the greater of platform fees paid by you in the prior 12 months or R1,500, except where prohibited by the CPA, ECTA, or other mandatory law.',
        'Nothing in this policy limits mandatory consumer rights under South African law.',
      ],
    },
    {
      id: 'contact',
      title: '10. Contact',
      content: [
        'Payment and escrow questions: support@elofix.com.',
      ],
    },
  ],
};
