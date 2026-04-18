import type { Job, JobStatus } from '@/types';
import {
  UNIFIED_TIMELINE_STEPS,
  UNIFIED_TIMELINE_LAST_INDEX,
  getUnifiedTimelineStepIndex,
} from '@/lib/jobStatusMapping';

/** Fixed 6-step labels shown on user job detail timeline (UI only). */
export const USER_TIMELINE_STEPS = UNIFIED_TIMELINE_STEPS;

const LAST_STEP_INDEX = UNIFIED_TIMELINE_LAST_INDEX;

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

/**
 * Derives timeline indices and terminal (cancel/reject) pin for rendering.
 */
export function getUserTimelineViewState(job: Job): UserTimelineViewState {
  if (job.status === 'CANCELLED') {
    const from = job.cancelledAtStatus;
    const pinIndex =
      from != null ? getUserTimelineStepIndex(from) : LAST_STEP_INDEX;
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
