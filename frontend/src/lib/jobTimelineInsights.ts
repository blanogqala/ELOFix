import type { Job } from '@/types';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { UNIFIED_TIMELINE_STEPS } from '@/lib/jobStatusMapping';
import { allMaterialsPaidAggregate, getMonotonicTimelineStepIndex } from '@/lib/jobProgressDisplay';
import { getUserTimelineViewState } from '@/lib/userJobTimeline';
import { isAdminRequiredCompletionPayment } from '@/lib/completionPaymentDue';

export interface TimelineStepInsight {
  stepIndex: number;
  stepLabel: string;
  nextAction: string;
  isDone: boolean;
}

function hasMaterials(job: Job): boolean {
  return (job.materials || []).length > 0;
}

export function getTimelineStepInsight(
  job: Job,
  stepIndex: number,
  materialRequests?: MaterialRequestDto[]
): TimelineStepInsight {
  const timelineState = getUserTimelineViewState(job, materialRequests);
  const isTerminal = timelineState.terminal !== 'none';
  const activeIndex = isTerminal ? timelineState.pinIndex : getMonotonicTimelineStepIndex(job);
  const isDone = !isTerminal && (job.status === 'COMPLETED' || stepIndex < activeIndex);
  const stepLabel = UNIFIED_TIMELINE_STEPS[stepIndex] ?? `Step ${stepIndex + 1}`;

  if (stepIndex === 0) {
    return {
      stepIndex,
      stepLabel,
      nextAction:
        job.status === 'PENDING'
          ? 'Waiting for a provider to accept this request.'
          : 'Job is open.',
      isDone,
    };
  }

  if (stepIndex === 1) {
    return {
      stepIndex,
      stepLabel,
      nextAction:
        job.status === 'ASSIGNED'
          ? 'Provider completes inspection and measurements.'
          : 'Inspection phase; provider prepares service price and materials.',
      isDone,
    };
  }

  if (stepIndex === 2) {
    const servicePaid = !!job.laborPaid;
    const materialsFullyPaid = allMaterialsPaidAggregate(job);
    return {
      stepIndex,
      stepLabel,
      nextAction:
        servicePaid && materialsFullyPaid
          ? 'Service and all material batches are paid.'
          : 'Complete service payment and pay every material batch.',
      isDone,
    };
  }

  if (stepIndex === 3) {
    return {
      stepIndex,
      stepLabel,
      nextAction:
        job.status === 'IN_PROGRESS'
          ? 'Provider is performing the work.'
          : 'Work proceeds once payments above are complete.',
      isDone,
    };
  }

  if (stepIndex === 4) {
    return {
      stepIndex,
      stepLabel,
      nextAction: isAdminRequiredCompletionPayment(job)
        ? 'Pay the remaining balance by the due date to complete this job.'
        : job.status === 'AWAITING_CONFIRMATION'
          ? 'Confirm completion when satisfied with the work.'
          : 'Provider will mark the job complete to reach this step.',
      isDone,
    };
  }

  return {
    stepIndex,
    stepLabel,
    nextAction: hasMaterials(job) ? 'Job finished.' : 'Reach completion.',
    isDone,
  };
}
