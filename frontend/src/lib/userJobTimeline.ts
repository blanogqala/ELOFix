import type { Job, JobStatus } from '@/types';
import {
  UNIFIED_TIMELINE_STEPS,
  getUnifiedTimelineStepIndex,
} from '@/lib/jobStatusMapping';

/** Fixed 6-step labels shown on user job detail timeline (UI only). */
export const USER_TIMELINE_STEPS = UNIFIED_TIMELINE_STEPS;

/**
 * Maps backend job status to a linear timeline index 0..5.
 * Does not encode cancel/reject — use {@link getUserTimelineViewState} for CANCELLED/REJECTED jobs.
 */
export function getUserTimelineStepIndex(status: JobStatus): number {
  return getUnifiedTimelineStepIndex(status);
}

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
  // Prefer explicit pre-cancel status when available.
  if (job.cancelledAtStatus && job.cancelledAtStatus !== 'CANCELLED' && job.cancelledAtStatus !== 'REJECTED') {
    return getUserTimelineStepIndex(job.cancelledAtStatus);
  }

  const hasAwaitingConfirmationSignals =
    (job.jobNotes || []).some((n) => /awaiting confirmation|marked as complete|mark as complete/i.test(String(n.message || ''))) ||
    Boolean(job.completionConfirmedByUser);
  if (hasAwaitingConfirmationSignals) return 4;

  const hasInProgressSignals =
    Boolean(job.laborPaid) &&
    ((job.materialPayments || []).some((p) => p.status === 'paid') || (job.storeOrders || []).length > 0) &&
    (((job.chat || []).length > 0) || ((job.jobNotes || []).length > 0));
  if (hasInProgressSignals) return 3;

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
 */
export function getUserTimelineViewState(job: Job): UserTimelineViewState {
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
    currentIdx: getUserTimelineStepIndex(job.status),
    pinIndex: 0,
    terminal: 'none',
  };
}
