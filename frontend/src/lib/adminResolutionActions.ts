/** Canonical admin resolution actions for disputes and cancellations. */
export const ADMIN_RESOLUTION_ACTIONS = [
  { value: 'RELEASE_FUNDS', label: 'Release remaining funds to provider' },
  { value: 'FULL_REFUND', label: 'Refund customer' },
  { value: 'RETURN_PROVIDER', label: 'Return provider to site' },
  { value: 'CLOSE_CASE', label: 'Close case' },
] as const;

export type AdminResolutionActionValue = (typeof ADMIN_RESOLUTION_ACTIONS)[number]['value'];

export const ADMIN_RESOLUTION_HELP =
  'Release remaining funds requires the customer to pay the unpaid completion tranche (30-day due). Refund customer uses paid amounts only — never the unpaid completion amount. Close case does not move money.';
