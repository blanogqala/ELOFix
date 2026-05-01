import type { Job } from '@/types';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { UNIFIED_TIMELINE_STEPS } from '@/lib/jobStatusMapping';
import { getMonotonicTimelineStepIndex, getStepIndexFromJobState, jobHasStarted } from '@/lib/jobProgressDisplay';

/** Original six timeline labels (same as dashboards / badges). */
export const USER_TIMELINE_STEPS = UNIFIED_TIMELINE_STEPS;

export type UserTimelineTerminal = 'none' | 'cancelled' | 'rejected';

export interface UserTimelineViewState {
  currentIdx: number;
  /** Step index (0–5) highlighted in red when job is cancelled, or 0 when rejected */
  pinIndex: number;
  terminal: UserTimelineTerminal;
  /** ISO date string for cancelled/rejected subtitle, if any */
  terminalAt?: string;
}

function hasNonEmptyObject(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0);
}

function inferCancelledPinIndex(job: Job): number {
  if (job.cancelledAtStatus && job.cancelledAtStatus !== 'CANCELLED' && job.cancelledAtStatus !== 'REJECTED') {
    return getStepIndexFromJobState({ ...job, status: job.cancelledAtStatus });
  }

  const hasAwaitingConfirmationSignals =
    (job.jobNotes || []).some((n) => /awaiting confirmation|marked as complete|mark as complete/i.test(String(n.message || ''))) ||
    Boolean(job.completionConfirmedByUser);
  if (hasAwaitingConfirmationSignals) return 4;

  if (jobHasStarted(job)) return 3;

  const hasPaymentOrPricingSignals =
    Boolean(job.servicePrice) ||
    Boolean(job.servicePayment) ||
    Boolean(job.laborPaid) ||
    (job.materialPayments || []).length > 0 ||
    (job.storeOrders || []).length > 0;
  if (hasPaymentOrPricingSignals) return 2;

  const hasInspectionSignals =
    Boolean(job.providerId) ||
    hasNonEmptyObject(job.providerAdjustedRequirements?.measurements) ||
    Boolean(job.providerAdjustedRequirements?.requirementNotes?.trim());
  if (hasInspectionSignals) return 1;

  return 0;
}

/**
 * Derives timeline indices and terminal (cancel/reject) pin for rendering.
 * @param _materialRequests reserved for API parity with provider (unused; job JSON is source of truth).
 */
export function getUserTimelineViewState(
  job: Job,
  _materialRequests?: MaterialRequestDto[]
): UserTimelineViewState {
  if (job.status === 'CANCELLED') {
    const pinIndex = inferCancelledPinIndex(job);
    return {
      currentIdx: pinIndex,
      pinIndex,
      terminal: 'cancelled',
      terminalAt: job.cancelledAt,
    };
  }

  if (job.status === 'REJECTED') {
    return {
      currentIdx: 0,
      pinIndex: 0,
      terminal: 'rejected',
      terminalAt: job.rejectedAt,
    };
  }

  return {
    currentIdx: getMonotonicTimelineStepIndex(job),
    pinIndex: 0,
    terminal: 'none',
  };
}

export { JOB_TIMELINE_LABELS } from '@/lib/jobProgressDisplay';
