import type { Job } from '@/types';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { getUserTimelineViewState } from '@/lib/userJobTimeline';
import { UNIFIED_TIMELINE_STEPS } from '@/lib/jobStatusMapping';

export const PROVIDER_JOB_TIMELINE_STEPS = UNIFIED_TIMELINE_STEPS;

export type ProviderJobTimelineTerminal = 'none' | 'cancelled' | 'rejected';

export interface ProviderJobTimelineViewState {
  currentIdx: number;
  pinIndex: number;
  terminal: ProviderJobTimelineTerminal;
  terminalAt?: string;
}

export function getProviderJobTimelineViewState(
  job: Job,
  materialRequests: MaterialRequestDto[]
): ProviderJobTimelineViewState {
  const view = getUserTimelineViewState(job, materialRequests);
  return {
    currentIdx: view.currentIdx,
    pinIndex: view.pinIndex,
    terminal: view.terminal as ProviderJobTimelineTerminal,
    terminalAt: view.terminalAt,
  };
}

export function getProviderTimelineStepInsight(
  job: Job,
  materialRequests: MaterialRequestDto[],
  stepIndex: number
): { stepLabel: string; nextAction: string } {
  const label = PROVIDER_JOB_TIMELINE_STEPS[stepIndex] ?? `Step ${stepIndex + 1}`;
  const submitted = materialRequests.some((r) => r.status === 'submitted' || r.status === 'paid');
  const paid =
    materialRequests.some((r) => r.status === 'paid') || (job.storeOrders || []).some((o) => o.payment?.materialsPaid);

  const actions: Record<number, string> = {
    0: 'Waiting for a provider to accept this job.',
    1: 'Complete inspection and submit the service price when ready.',
    2: submitted
      ? 'Customer must pay the service fee and every material batch.'
      : 'Submit materials for the customer to review and pay.',
    3: 'Active work on site. Update the customer and mark complete when finished.',
    4: 'Waiting for the customer to confirm completion.',
    5: 'Job completed.',
  };

  return { stepLabel: label, nextAction: actions[stepIndex] ?? '—' };
}
