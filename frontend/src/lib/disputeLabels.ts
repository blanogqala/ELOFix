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
      return 'Release remaining funds to provider';
    case 'PARTIAL_REFUND':
      return 'Partial refund issued to customer';
    case 'FULL_REFUND':
      return 'Refund customer';
    case 'RETURN_PROVIDER':
      return 'Return provider to site';
    case 'CLOSE_CASE':
      return 'Case closed';
    default:
      return action.replace(/_/g, ' ');
  }
}

export function formatDisputeOpenedAt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function formatMessageSenderLabel(params: {
  senderRole: string;
  senderName?: string | null;
  customerName?: string | null;
  providerName?: string | null;
}): string {
  const role = String(params.senderRole || '').toUpperCase();
  if (role === 'CUSTOMER') {
    const name = params.senderName || params.customerName || 'Customer';
    return `${name} · Customer`;
  }
  if (role === 'PROVIDER') {
    const name = params.senderName || params.providerName || 'Provider';
    return `${name} · Provider`;
  }
  if (role === 'ADMIN') {
    const name = params.senderName || 'EloFix Admin';
    return `${name} · Admin`;
  }
  return params.senderName || role.replace(/_/g, ' ');
}
