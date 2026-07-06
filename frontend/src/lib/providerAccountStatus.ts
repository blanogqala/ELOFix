import type { Provider } from '@/types';

export type ProviderAccountStatus =
  | 'blocked'
  | 'approved'
  | 'rejected'
  | 'incomplete'
  | 'pending';

export type ProviderAccountStatusInput = Pick<
  Provider,
  | 'approved'
  | 'blocked'
  | 'profileCompleted'
  | 'rejectionReason'
  | 'rejectedAt'
  | 'reviewSubmittedAt'
>;

export function isProviderApplicationRejected(
  provider: ProviderAccountStatusInput
): boolean {
  return Boolean(provider.rejectedAt || provider.rejectionReason?.trim());
}

export function isProviderAwaitingApproval(
  provider: ProviderAccountStatusInput
): boolean {
  return (
    provider.profileCompleted === true &&
    Boolean(provider.reviewSubmittedAt) &&
    !provider.approved &&
    !provider.blocked &&
    !isProviderApplicationRejected(provider)
  );
}

export function getProviderAccountStatus(
  provider: ProviderAccountStatusInput
): ProviderAccountStatus {
  if (provider.blocked) return 'blocked';
  if (provider.approved) return 'approved';
  if (isProviderApplicationRejected(provider)) return 'rejected';
  if (provider.profileCompleted !== true) return 'incomplete';
  if (isProviderAwaitingApproval(provider)) return 'pending';
  return 'incomplete';
}

export function getProviderAccountStatusLabel(status: ProviderAccountStatus): string {
  switch (status) {
    case 'blocked':
      return 'Blocked';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'incomplete':
      return 'Incomplete';
    case 'pending':
      return 'Pending';
    default:
      return 'Pending';
  }
}

export function getProviderAccountStatusBadgeClass(status: ProviderAccountStatus): string {
  switch (status) {
    case 'blocked':
    case 'rejected':
      return 'status-badge status-cancelled';
    case 'approved':
      return 'status-badge status-completed';
    case 'pending':
      return 'status-badge status-assigned';
    case 'incomplete':
    default:
      return 'status-badge status-created';
  }
}

export function canAdminActOnProviderApplication(
  provider: ProviderAccountStatusInput
): boolean {
  return (
    provider.profileCompleted === true &&
    Boolean(provider.reviewSubmittedAt) &&
    !provider.approved &&
    !provider.blocked
  );
}

export function canAdminUnrejectProvider(provider: ProviderAccountStatusInput): boolean {
  return (
    isProviderApplicationRejected(provider) &&
    !provider.approved &&
    !provider.blocked
  );
}
