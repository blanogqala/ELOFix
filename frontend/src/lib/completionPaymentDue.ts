import type { Job } from '@/types';
import { formatCurrency } from '@/lib/formatCurrency';

/** Job or provider earnings row — only the fields needed for admin-required payment. */
export type CompletionPaymentDueFields = {
  completionPaymentDue?: Job['completionPaymentDue'] | {
    amountDue: number;
    dueAt?: string | null;
    status?: string;
    source?: string | null;
    resolutionLogId?: string | null;
  } | null;
  completionPayment?: unknown;
  paymentProgress?: string | null;
};

export function isCompletionPaymentOverdue(job: CompletionPaymentDueFields): boolean {
  if (String(job.status || '').toUpperCase() === 'DISPUTED') return false;
  return String(job.completionPaymentDue?.status || '').toUpperCase() === 'OVERDUE';
}

export function hasOutstandingCompletionPayment(job: CompletionPaymentDueFields): boolean {
  if (String(job.status || '').toUpperCase() === 'DISPUTED') return false;
  const due = job.completionPaymentDue;
  if (!due || !(Number(due.amountDue) > 0)) return false;
  if (job.completionPayment) return false;
  if (String(job.paymentProgress || '') === 'FULLY_PAID') return false;
  return true;
}

export function isAdminRequiredCompletionPayment(job: CompletionPaymentDueFields): boolean {
  if (!hasOutstandingCompletionPayment(job)) return false;
  const src = String(job.completionPaymentDue?.source || '').toUpperCase();
  return src === 'ADMIN_RELEASE' || Boolean(job.completionPaymentDue?.resolutionLogId);
}

export function getAdminCompletionPaymentStatusLabel(job: CompletionPaymentDueFields): string {
  return isCompletionPaymentOverdue(job) ? 'Payment overdue' : 'Payment required';
}

export function formatCompletionPaymentDueDate(job: Job): string | null {
  const dueAt = job.completionPaymentDue?.dueAt;
  if (!dueAt) return null;
  return new Date(dueAt).toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

export function getCompletionPaymentDueSummaryLine(job: Job): string | null {
  if (!isAdminRequiredCompletionPayment(job)) return null;
  const amount = Number(job.completionPaymentDue?.amountDue);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const dueLabel = formatCompletionPaymentDueDate(job);
  const amountText = formatCurrency(amount, { decimals: 2 });
  if (dueLabel) return `Pay ${amountText} by ${dueLabel}`;
  return `Pay ${amountText} by the due date`;
}

export const CONFIRMATION_WINDOW_EXPIRED_MESSAGE =
  'Confirmation window expired — awaiting final payment.';

export function confirmationCountdownCopy(options: {
  expiredUnpaid: boolean;
  balanceOutstanding: boolean;
}): { title: string; detail: string } {
  if (options.expiredUnpaid) {
    return {
      title: CONFIRMATION_WINDOW_EXPIRED_MESSAGE,
      detail: 'Pay the outstanding balance to complete this job. Silence does not confirm the work.',
    };
  }
  if (options.balanceOutstanding) {
    return {
      title: 'Waiting for customer confirmation',
      detail: 'Time left to confirm or pay the final balance.',
    };
  }
  return {
    title: 'Waiting for customer confirmation',
    detail: 'Time left to confirm completion.',
  };
}

export function getProviderAdminPaymentWaitingTitle(): string {
  return 'Waiting for customer final payment';
}

export function getProviderAdminPaymentWaitingDescription(): string {
  return 'EloFix reviewed the dispute or cancellation and determined the customer must pay the remaining balance before this job can be finalized. Your actions are paused until payment is received.';
}

export function getProviderAdminPaymentTimelineInsight(): string {
  return 'Waiting for the customer to pay the remaining balance after admin resolution.';
}
