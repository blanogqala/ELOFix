import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';
import { COMPANY, LEGAL_OPERATOR_INTRO } from '../../company';

const EFFECTIVE_JOB_COMPLETION = 'August 18, 2026';
const EFFECTIVE_PAYMENT_SCHEDULE = 'September 14, 2026';

export const jobCompletionVerification: LegalDocument = {
  id: 'job-completion-verification',
  title: 'Job Completion Verification Policy',
  subtitle: 'How Customers verify completed work and how Jobs are closed on EloFix.',
  effectiveDate: EFFECTIVE_JOB_COMPLETION,
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
  effectiveDate: EFFECTIVE_PAYMENT_SCHEDULE,
  version: LEGAL_VERSIONS.escrowPolicy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        `This policy describes how ${COMPANY.legalName}, operating the EloFix Platform, facilitates Customer payments to Providers and Suppliers according to transparent payment schedules for each service or order type.`,
        LEGAL_OPERATOR_INTRO,
        'Customer payment processing and supported marketplace settlement are performed through third-party payment service providers. Paystack is currently EloFix\'s primary live payment processor. EloFix may introduce, replace, or use another approved payment service provider in the future, subject to applicable notice requirements.',
        'EloFix is a marketplace technology platform, not a bank, deposit-taker, wallet provider, insurer, or escrow agent. EloFix does not hold Provider or Supplier settlement funds as customer deposits and does not guarantee Provider or Supplier earnings.',
        'EloFix records PaymentIntents, commissions, recipient shares, disputes, refunds, and accounting records. EloFix may receive its platform commission and may receive Provider refund repayments. EloFix does not itself perform a second manual transfer of the ordinary Provider or Supplier marketplace share after a supported Paystack split-at-charge settlement.',
        'Whether any arrangement is treated as escrow or another regulated payment activity under South African law depends on the licensed provider\'s product and requires appropriate legal advice. This document is informational platform policy only and is not a claim of regulatory approval.',
      ],
    },
    {
      id: 'live-marketplace-flow',
      title: '2. Live Marketplace Payment Flow',
      content: [
        'For eligible service labor, the current live marketplace flow is:',
        'The Customer pays a transaction tranche. Paystack processes the payment. The current EloFix platform commission is 7% of that collected tranche. The current Provider gross marketplace share is 93% of that collected tranche. Where supported, marketplace settlement may be routed through the Provider\'s verified Paystack subaccount. Paystack and the banking system determine when funds actually appear in the Provider\'s bank account.',
        'Paystack may split an eligible marketplace transaction between EloFix\'s platform commission and the Provider or Supplier\'s verified Paystack subaccount. Recording that split in EloFix is not the same as a completed bank credit.',
        'Successful Customer payment does not mean immediate bank credit. EloFix does not guarantee a specific bank-credit date.',
      ],
    },
    {
      id: 'labor-payment-schedule',
      title: '3. Labor Payment Schedules',
      content: [
        'When a Customer pays for labor on a Job, the gross labor amount for that collected tranche is processed through the applicable payment service provider. Paystack is currently the primary live processor for that collection.',
        'The current contractual EloFix platform commission is 7% of each collected customer labor payment tranche. The Provider\'s 93% share is a GROSS marketplace share recorded in EloFix\'s financial ledger. A Provider\'s recorded 93% marketplace share is the gross Provider share before any payment-processing fees that the payment service provider may lawfully deduct from that recipient under the applicable settlement configuration. It is not necessarily the exact net amount credited to the Provider\'s bank account.',
        'Customer payment confirmation is not the same as Provider bank settlement. A recorded or payable share is not automatically a cash deposit into the Provider\'s bank account.',
        'EloFix is not a deposit-taking escrow agent and does not hold Provider settlement money as customer deposits.',
        'The Platform supports three live labor payment modes. The applicable mode is shown at checkout and in the Job details:',
        'TWO_PAYMENT_50_50 — first transaction: approximately 50% of the quoted labor amount. Second transaction: the remaining approximately 50% once it becomes due under the Job workflow. Each successful transaction is separately subject to the current 7% EloFix commission.',
        'SINGLE_PAYMENT_UPFRONT — the Customer pays the full service amount upfront before work progresses. Commission of 7% applies to that collected payment.',
        'SINGLE_PAYMENT_ON_COMPLETION — the Customer does not pay labor upfront. Payment becomes due after the configured completion or confirmation flow. Commission of 7% applies when that payment is collected.',
        'Provider workflow: receive requests → quote → receive the applicable customer payment for that category model where due → perform work → request completion → receive any remaining recorded share where applicable, subject to payment-processor settlement timing.',
      ],
    },
    {
      id: 'material-payments',
      title: '4. Material and Supplier Payments',
      content: [
        'Material order payments are subject to a 7% platform commission on the materials subtotal. The recorded Supplier earning is the subtotal minus commission after payment confirmation. That recorded earning is a gross marketplace share and is not necessarily the exact net bank credit after payment-processor fees.',
        'Material payments are not subject to job-completion staged payment holds. Where Paystack marketplace settlement is used, eligible Supplier or branch funds may be routed to a nominated verified Paystack subaccount or other payout destination. Saving banking details, creating a payout destination, verifying that destination, and completed bank settlement are distinct states.',
        'EloFix does not promise automatic or instant Supplier bank settlement where marketplace settlement is not supported, or where verification, banking, or compliance delays apply.',
        'Delivery fees are processed as separate payment intents through the applicable payment service provider and follow their own collection and settlement timing.',
      ],
    },
    {
      id: 'customer-transparency',
      title: '5. Customer Transparency',
      content: [
        'Customers see the applicable payment model (TWO_PAYMENT_50_50, SINGLE_PAYMENT_UPFRONT, or SINGLE_PAYMENT_ON_COMPLETION) before confirming payment for a Job.',
        'For TWO_PAYMENT_50_50 Jobs, Customers may dispute completed work within the 7-day verification window, which may pause the remaining customer payment pending investigation.',
        'If an outstanding customer service balance becomes payable, the Customer must settle it within 30 calendar days. Failure to settle an outstanding amount within 30 calendar days may result in restrictions on new marketplace transactions, account suspension or blocking, referral for lawful debt recovery, and further legal action where appropriate.',
        'Cancellation refunds follow the Refund, Returns & Cancellation Policy. Courier en-route forfeiture, where implemented, is separate from ordinary service cancellation review.',
      ],
    },
    {
      id: 'provider-transparency',
      title: '6. Provider Transparency',
      content: [
        'Providers see the mobilisation tranche (where applicable) become payable upon confirmed labor payment, according to the category payment model shown on the Job.',
        'Any remaining tranche becomes payable upon Customer acceptance, automatic acceptance, or admin resolution in the Provider\'s favour. Payable status in EloFix is not the same as completed bank settlement.',
        'Where Paystack split-at-charge marketplace settlement is used for an eligible transaction, EloFix does not normally send a second manual transfer of the Provider\'s 93% gross share after that settlement.',
        'Final staged tranches generally do not become payable for settlement while an open dispute exists, except by administrator decision.',
      ],
    },
    {
      id: 'settlement-timing',
      title: '7. Settlement Timing',
      content: [
        'Successful Customer payment does not mean immediate bank credit.',
        'Paystack\'s current standard South African settlement schedule is generally T+2 working days from the relevant transaction date for eligible transactions. Actual timing may be affected by payout-destination verification, transaction type, weekends, public holidays, bank processing, payment-network processing, compliance or fraud reviews, Paystack operating rules, and other circumstances outside EloFix\'s control.',
        'This timing is based on the payment provider\'s current settlement schedule, which may change. EloFix does not guarantee a specific bank-credit date.',
        'Paystack may require payout-destination verification before settlement. Saving banking details in EloFix is not the same as Paystack verification. Paystack verification is not the same as completed bank settlement.',
      ],
    },
    {
      id: 'elofix-rights',
      title: '8. EloFix Rights and Commission',
      content: [
        'EloFix retains the current contractual 7% platform commission on confirmed labor and material transactions, except where applicable law, card-scheme rules, payment-service-provider requirements, or a binding determination requires otherwise.',
        'EloFix may delay, withhold instructions for, or reverse settlement steps for fraud review, chargebacks, policy violations, open disputes, or legal compliance, subject to payment-service-provider capabilities.',
        'The EloFix platform commission is ordinarily retained on approved service refunds under the Platform\'s current commercial model, except where applicable law, card-scheme rules, payment-service-provider requirements or a binding determination requires otherwise.',
        'When refund recovery from a Provider is required, Customer refunds follow the Refund, Returns & Cancellation Policy: provider repayment where required, admin verification, then payment-service-provider refund processing (which may complete, require manual processing, or fail).',
      ],
    },
    {
      id: 'cancellation-refunds',
      title: '9. Cancellation and Refund Impact on Payment Schedules',
      content: [
        'Before provider amounts become payable under the schedule: net labor refund to Customer is ordinarily calculated on the eligible Provider share (93% of eligible paid gross labor), subject to payment-service-provider processing and confirmation and to mandatory law.',
        'After a first tranche has become payable on a TWO_PAYMENT_50_50 Job: refund may be limited to any remaining unsettled balance plus recoverable provider amounts; any shortfall is recovered from the Provider over up to 30 calendar days.',
        'Admin partial or full refunds through dispute resolution may trigger provider clawback from unsettled balances, recorded earnings, or recorded refund debt as applicable.',
      ],
    },
    {
      id: 'disputes',
      title: '10. Disputes and Payment Pause',
      content: [
        'When a Customer opens a dispute, the labor payment intent is marked as disputed and any remaining staged tranche does not become payable for settlement until the dispute is resolved.',
        'Administrator outcomes may include full refund, partial refund, release of remaining payment, return for corrective work, or case closure. See the Dispute Resolution Policy.',
      ],
    },
    {
      id: 'limitation',
      title: '11. Limitation of Liability',
      content: [
        'EloFix is not liable for failures, delays, or errors of payment service providers, banks, or card networks.',
        'EloFix does not guarantee that Providers or Suppliers will perform to Customer expectations, and does not guarantee that payments will settle on any particular date. Bank settlement timing is controlled by the payment processor and banking system.',
        'To the maximum extent permitted by South African law, EloFix\'s aggregate liability for payment-schedule-related claims is limited to the greater of platform fees paid by you in the prior 12 months or R1,500, except where prohibited by the CPA, ECTA, or other mandatory law.',
        'Nothing in this policy limits mandatory consumer rights under South African law.',
      ],
    },
    {
      id: 'contact',
      title: '12. Contact',
      content: [
        `Payment schedule questions: ${COMPANY.email}.`,
      ],
    },
  ],
};
