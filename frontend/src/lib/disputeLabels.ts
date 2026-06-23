export function formatRequestedResolution(value: string, otherDetail?: string | null): string {
  switch (value) {
    case 'PROVIDER_RETURN_FIX':
      return 'Provider must return and fix';
    case 'REFUND':
    case 'PARTIAL_REFUND':
    case 'FULL_REFUND':
      return 'Refund';
    case 'OTHER':
      return otherDetail ? `Other: ${otherDetail}` : 'Other';
    default:
      return value.replace(/_/g, ' ');
  }
}

export function formatDisputeStatus(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'OPEN':
      return 'Open';
    case 'UNDER_INVESTIGATION':
      return 'Under investigation';
    case 'RESOLVED':
      return 'Resolved';
    case 'CLOSED':
      return 'Closed';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function formatAdminResolutionAction(action: string): string {
  switch (String(action || '').toUpperCase()) {
    case 'RELEASE_FUNDS':
      return 'Remaining funds released to provider';
    case 'PARTIAL_REFUND':
      return 'Partial refund issued to customer';
    case 'FULL_REFUND':
      return 'Full refund issued to customer';
    case 'RETURN_PROVIDER':
      return 'Provider sent back to fix issues';
    case 'CLOSE_CASE':
      return 'Case closed without further action';
    default:
      return action.replace(/_/g, ' ');
  }
}
