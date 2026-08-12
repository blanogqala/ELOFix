import type { CategoryPaymentMode, Job, LaborPaymentType } from '@/types';

export function formatZar(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 'R0.00';
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function paymentModeLabel(mode: CategoryPaymentMode | string | null | undefined): string {
  switch (String(mode || '')) {
    case 'TWO_PAYMENT_50_50':
      return '50% + 50%';
    case 'SINGLE_PAYMENT_UPFRONT':
      return '100% upfront';
    case 'SINGLE_PAYMENT_ON_COMPLETION':
      return '100% after completion';
    default:
      return 'Payment schedule';
  }
}

export function laborPayButtonLabel(job: Job): string {
  const type = job.nextLaborPaymentType;
  const amount =
    type === 'COMPLETION'
      ? Number(job.secondPaymentAmount ?? 0)
      : Number(job.firstPaymentAmount ?? job.servicePrice?.amount ?? 0);
  const money = formatZar(amount);
  switch (type) {
    case 'DEPOSIT':
      return `Pay 50% deposit (${money})`;
    case 'COMPLETION':
      return `Pay remaining 50% (${money})`;
    case 'FULL_UPFRONT':
      return `Pay full amount (${money})`;
    case 'FULL_COMPLETION':
      return `Pay service amount (${money})`;
    default:
      return `Pay service (${money})`;
  }
}

export function canShowLaborPayCta(job: Job): boolean {
  if (job.legacyEscrowV2) {
    return Boolean(job.servicePrice && !job.laborPaid);
  }
  return Boolean(job.nextLaborPaymentType);
}

export function laborPaymentTypeHint(type: LaborPaymentType | null | undefined): string {
  switch (type) {
    case 'DEPOSIT':
      return 'Your first payment enables the provider to mobilise and begin the service. The remaining balance is payable after the provider requests completion.';
    case 'COMPLETION':
      return 'Your provider has requested completion. Pay the remaining balance to finalise the job.';
    case 'FULL_UPFRONT':
      return 'This service is paid in full before work begins.';
    case 'FULL_COMPLETION':
      return 'This service is paid in full after the provider marks the job complete.';
    default:
      return 'Your service is paid according to the payment schedule for this category.';
  }
}
