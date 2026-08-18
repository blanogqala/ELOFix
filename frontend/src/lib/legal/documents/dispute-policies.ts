import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';
import { COMPANY, LEGAL_OPERATOR_INTRO } from '../../company';

const EFFECTIVE = 'August 18, 2026';

export const disputeResolution: LegalDocument = {
  id: 'dispute-resolution',
  title: 'Dispute Resolution Policy',
  subtitle: 'How EloFix handles disagreements about completed Jobs and payments.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.disputeResolution,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes how Customers and Providers resolve disagreements about completed service work on the EloFix Platform, operated by ${COMPANY.legalName}.`,
        LEGAL_OPERATOR_INTRO,
        'EloFix provides dispute facilitation and investigation. EloFix does not guarantee any particular outcome.',
        'Disputed payment amounts are managed according to payment status and Platform accounting. EloFix does not hold disputed money as a deposit-taking escrow agent.',
      ],
    },
    {
      id: 'eligibility',
      title: '2. Eligibility to Open a Dispute',
      content: [
        'Only the Customer on a Job may open a dispute.',
        'Disputes may only be opened while the Job is in Awaiting Confirmation status during the 7-day verification window.',
        'Only one active dispute (open or under investigation) may exist per Job at a time.',
        'Customers cannot confirm completion while an open dispute exists.',
      ],
    },
    {
      id: 'customer-submission',
      title: '3. Customer Dispute Submission',
      content: [
        'To open a dispute, the Customer must provide a written comment describing the issue.',
        'The Customer may upload supporting evidence including photographs, videos, and notes.',
        'The Customer must select a requested resolution: Provider return to fix, refund (admin determines partial or full), or other (with detail).',
        'Requesting a refund does not automatically trigger a refund. Administrator investigation and determination are required.',
      ],
    },
    {
      id: 'provider-response',
      title: '4. Provider Response',
      content: [
        'The Provider is notified when a dispute is opened and may submit evidence including photographs, videos, explanations, and progress reports.',
        'The Provider may participate in the dispute message thread through the Platform.',
        'Failure to respond may be considered in the investigation but does not automatically determine the outcome.',
      ],
    },
    {
      id: 'investigation',
      title: '5. EloFix Investigation',
      content: [
        'EloFix administrators review submitted evidence, Platform records, payment history, completion evidence, and communications.',
        'Disputes may be marked as open, under investigation, resolved, or closed.',
        'Multi-round dispute history is maintained. A resolved or closed dispute may be reopened if new issues arise, creating a new dispute round.',
        'During investigation, any remaining staged payment tranche remains paused and the labor payment intent is marked as disputed.',
      ],
    },
    {
      id: 'outcomes',
      title: '6. Possible Outcomes',
      content: [
        'Release remaining payment: Any remaining staged payment tranche becomes payable to the Provider according to the Payment Schedule and Transparency Policy. The Job is marked Completed and the dispute is closed.',
        'Partial Refund: A specified net amount based on eligible paid labor (up to 93% of gross labor paid) may be approved for the Customer. Provider clawback or repayment obligations may apply. The Job may be cancelled.',
        'Full Refund: The maximum net labor refund based on eligible paid labor (93% of gross labor paid) may be approved for the Customer. Provider clawback or repayment obligations may apply. The Job is cancelled.',
        'Return Provider (Corrective Work): The Provider is instructed to return and fix the work. The Job reopens to In Progress. See the Corrective Work Policy.',
        'Close Case: The dispute is resolved without remaining-payment release or refund adjustment, based on administrator determination.',
      ],
    },
    {
      id: 'refund-processing',
      title: '7. Refund Processing',
      content: [
        'Approved refunds follow the Refund, Returns & Cancellation Policy sequence, including provider repayment where required, admin verification, and payment-service-provider processing.',
        'Customer refunds are calculated on eligible paid labor (93% of gross labor paid; platform commission is retained). Provider clawback is calculated on the provider share.',
        'Refund statuses may include approved, processing, completed, requires manual processing, or could not be completed. A refund is described as returned to the original payment method only after payment-service-provider confirmation.',
        'When recovery from a Provider is required, that portion is not guaranteed instantly. Providers must complete repayment within 30 days through supported gateway repayment and/or bank transfer / EFT (and/or recovery from future earnings where applicable).',
        'Providers who fail to settle refund debt within 30 days may have accounts blocked and may be referred for legal recovery.',
        'Trust score adjustments may apply following dispute outcomes.',
      ],
    },
    {
      id: 'finality',
      title: '8. Decision Finality',
      content: [
        'Administrator dispute decisions are final on the Platform, subject to applicable South African law and consumer rights that cannot be contracted away.',
        'See the Admin Review and Investigation Policy for administrator authority.',
      ],
    },
    {
      id: 'contact',
      title: '9. Contact',
      content: [
        `Dispute support: ${COMPANY.email} with your Job reference number.`,
      ],
    },
  ],
};

export const adminInvestigation: LegalDocument = {
  id: 'admin-investigation',
  title: 'Admin Review and Investigation Policy',
  subtitle: 'How EloFix administrators review Platform activity and make decisions.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.adminInvestigation,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes the authority and procedures of administrators of ${COMPANY.legalName}, operating the EloFix Platform, in reviewing Platform activity, investigating issues, and making binding Platform decisions.`,
        LEGAL_OPERATOR_INTRO,
      ],
    },
    {
      id: 'admin-authority',
      title: '2. Administrator Authority',
      content: [
        'EloFix administrators may, as necessary to operate the Platform safely and lawfully:',
        'Review dispute evidence, completion evidence, and communications between users.',
        'Investigate payment activity, payment-schedule status, refunds, provider repayment, and chargebacks.',
        'Review Provider verification documents and approve or reject verification.',
        'Review fraud alerts, device intelligence records, and duplicate identity signals.',
        'Review audit logs and Platform activity records.',
        'Block or unblock user accounts.',
        'Approve or reject Provider applications and individual KYC documents.',
        'Set Provider fraud review status.',
        'Release remaining payment, pause settlement steps, or process refund-related actions according to Platform payment status and payment-service-provider capabilities.',
        'Resolve disputes with outcomes including refunds, release of remaining payment, corrective work orders, or case closure.',
        'Review settlement and banking-destination records for Providers and Suppliers. In-app withdrawal of earnings is not a current Platform product feature.',
        'Manage Supplier accounts and material order issues.',
      ],
    },
    {
      id: 'investigation-process',
      title: '3. Investigation Process',
      content: [
        'Administrators act on information available through the Platform, including user-submitted evidence, system records, payment service provider data, and audit logs.',
        'Administrators may request additional information or verification from users during an investigation.',
        'Investigations may result in account restrictions, verification revocation, payment-status actions, refunds, or referral to law enforcement where appropriate.',
      ],
    },
    {
      id: 'decision-finality',
      title: '4. Decision Finality',
      content: [
        'Administrator decisions on the Platform are final unless otherwise required by applicable South African law.',
        'Mandatory consumer rights under the Consumer Protection Act, data subject rights under POPIA, and other non-waivable legal rights are not affected by this policy.',
        `Users may contact ${COMPANY.email} to request review of administrator actions. EloFix is not obligated to reopen decided matters except where required by law.`,
      ],
    },
    {
      id: 'records',
      title: '5. Records and Audit',
      content: [
        'Administrator actions are logged in Platform audit records as described in the Platform Activity Records Policy.',
        'Audit records may be used for compliance, security, fraud prevention, and legal defence.',
      ],
    },
    {
      id: 'contact',
      title: '6. Contact',
      content: [
        `Administrator action inquiries: ${COMPANY.email}.`,
      ],
    },
  ],
};

export const correctiveWork: LegalDocument = {
  id: 'corrective-work',
  title: 'Corrective Work Policy',
  subtitle: 'How Providers return to complete remedial work after a dispute.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.correctiveWork,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes what happens when a Provider is instructed to return to a Job site to complete corrective or remedial work on the EloFix Platform, operated by ${COMPANY.legalName}.`,
      ],
    },
    {
      id: 'triggers',
      title: '2. When Corrective Work Applies',
      content: [
        'Corrective work may be triggered when a Customer requests a Provider return to fix during a dispute, or when an EloFix administrator resolves a dispute with a Return Provider outcome.',
        'This policy does not apply to new Jobs or scope changes agreed outside of dispute resolution.',
      ],
    },
    {
      id: 'job-reopening',
      title: '3. Job Reopening',
      content: [
        'When corrective work is ordered, the Job status changes back to In Progress.',
        'The dispute is closed or cleared from the active Job status, and the completion timeline restarts.',
        'Previous completion timestamps and confirmation deadlines are reset.',
      ],
    },
    {
      id: 'payment-protection',
      title: '4. Payment Protection',
      content: [
        'Any remaining staged payment tranche (final provider payment) remains paused and does not become payable until the Customer verifies the remedial work.',
        'No additional labor charge applies for corrective work ordered through dispute resolution unless separately agreed through Platform flows.',
      ],
    },
    {
      id: 're-verification',
      title: '5. Re-Verification by Customer',
      content: [
        'After completing remedial work, the Provider must mark the Job as complete again.',
        'The Customer receives a new notification and a fresh 7-day verification window under the Job Completion Verification Policy.',
        'The Customer may accept, dispute again, or allow automatic acceptance after 7 days.',
      ],
    },
    {
      id: 'provider-obligations',
      title: '6. Provider Obligations',
      content: [
        'Providers must complete corrective work professionally and within a reasonable timeframe.',
        'Failure to complete corrective work may result in further dispute action, refund, account restrictions, or trust score penalties.',
      ],
    },
    {
      id: 'contact',
      title: '7. Contact',
      content: [
        `Corrective work questions: ${COMPANY.email}.`,
      ],
    },
  ],
};
