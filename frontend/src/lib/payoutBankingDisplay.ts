export type PayoutVerificationStatus =
  | 'NOT_CONFIGURED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'ACTION_REQUIRED'
  | 'REJECTED'
  | 'SUSPENDED';

export interface GatewaySettlementProfile {
  status?: string | null;
  provider?: string | null;
  recipientConfigured?: boolean;
}

export function payoutVerificationLabel(status: PayoutVerificationStatus | string | null | undefined): string {
  switch (status) {
    case 'VERIFIED':
      return 'Verified';
    case 'PENDING_VERIFICATION':
      return 'Pending verification';
    case 'ACTION_REQUIRED':
      return 'Action required';
    case 'REJECTED':
      return 'Verification failed';
    case 'SUSPENDED':
      return 'Suspended';
    default:
      return 'Not configured';
  }
}

export function gatewaySettlementLabel(
  supported: boolean,
  gatewayProfile?: GatewaySettlementProfile | null
): string {
  if (!supported) return 'Gateway settlement not yet enabled';
  if (!gatewayProfile?.recipientConfigured) {
    const status = String(gatewayProfile?.status || '').toUpperCase();
    if (status === 'GATEWAY_NOT_CONFIGURED' || status === 'AUTOMATIC_SETTLEMENT_UNAVAILABLE') {
      return 'Not yet enabled';
    }
    return gatewayProfile?.status || 'Not registered';
  }
  const status = String(gatewayProfile.status || '').toUpperCase();
  if (status === 'VERIFIED' || status === 'ACTIVE') return 'Verified';
  if (status === 'GATEWAY_NOT_CONFIGURED' || status === 'AUTOMATIC_SETTLEMENT_UNAVAILABLE') {
    return 'Not yet enabled';
  }
  return gatewayProfile.status || 'Pending';
}

export function payoutStatusBadgeClass(status: PayoutVerificationStatus | string | null | undefined): string {
  switch (status) {
    case 'VERIFIED':
      return 'bg-success text-success-foreground';
    case 'PENDING_VERIFICATION':
      return 'bg-amber-600 text-white';
    case 'ACTION_REQUIRED':
    case 'REJECTED':
    case 'SUSPENDED':
      return 'bg-destructive text-destructive-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function removeBlockedMessage(reason?: string | null): string {
  return reason || 'This bank account cannot be removed right now.';
}

export function postSaveVerificationMessage(): string {
  return 'Saved — verification pending until the payment gateway confirms your account.';
}
