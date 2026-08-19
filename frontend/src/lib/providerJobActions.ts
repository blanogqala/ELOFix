export const AWAITING_CONFIRMATION_MARK_COMPLETE_MSG =
  'Waiting for the customer to confirm completion.';

export function isProviderMarkCompleteDisabled(job: { status?: string } | null | undefined): boolean {
  return String(job?.status || '').toUpperCase() === 'AWAITING_CONFIRMATION';
}
