import type { AdminJobCaseSummary } from '@/lib/api/adminDisputes';
import { formatAdminResolutionAction } from '@/lib/disputeLabels';

export function getAdminCaseViewPath(summary: AdminJobCaseSummary): string {
  const base =
    summary.caseKind === 'cancellation'
      ? '/admin/cancellations'
      : '/admin/disputes';
  return `${base}/${summary.disputeId}`;
}

export type PayerBadgeKind = 'customer_owes' | 'provider_owes' | 'resolved' | 'neutral';

export function getPayerBadgeKind(summary: AdminJobCaseSummary): PayerBadgeKind {
  if (summary.payerRole === 'customer') return 'customer_owes';
  if (summary.payerRole === 'provider') return 'provider_owes';
  const action = String(summary.action || '').toUpperCase();
  if (action === 'FULL_REFUND' || action === 'PARTIAL_REFUND') return 'resolved';
  return 'neutral';
}

export function getPayerBadgeLabel(summary: AdminJobCaseSummary): string {
  const kind = getPayerBadgeKind(summary);
  if (kind === 'customer_owes') return 'Customer must pay';
  if (kind === 'provider_owes') return 'Provider must repay';
  if (kind === 'resolved') return 'Refund issued';
  return 'Case closed';
}

export { formatAdminResolutionAction };
