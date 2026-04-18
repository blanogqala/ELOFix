import type { Job } from '@/types';
import { USER_TIMELINE_STEPS, getUserTimelineViewState } from '@/lib/userJobTimeline';

export interface TimelineStepInsight {
  stepIndex: number;
  stepLabel: string;
  nextAction: string;
  isDone: boolean;
}

function hasMaterials(job: Job): boolean {
  return (job.materials || []).length > 0;
}

function hasAnyMaterialPaid(job: Job): boolean {
  return (job.materialPayments || []).some(payment => payment.status === 'paid');
}

function getInspectedStepContent(job: Job): {
  nextAction: string;
} {
  if (job.status === 'ASSIGNED') {
    return {
      nextAction: 'Provider must complete inspection.',
    };
  }

  if (!job.servicePrice) {
    return {
      nextAction: 'Provider must submit service price.',
    };
  }

  if (!hasMaterials(job)) {
    return {
      nextAction: 'Provider must add material list.',
    };
  }

  return {
    nextAction: 'Inspection phase completed.',
  };
}

export function getTimelineStepInsight(job: Job, stepIndex: number): TimelineStepInsight {
  const timelineState = getUserTimelineViewState(job);
  const isTerminal = timelineState.terminal !== 'none';
  const activeIndex = isTerminal ? timelineState.pinIndex : timelineState.currentIdx;
  const isDone = !isTerminal && (job.status === 'COMPLETED' || stepIndex < activeIndex);
  const stepLabel = USER_TIMELINE_STEPS[stepIndex] || `Step ${stepIndex + 1}`;

  if (stepIndex === 0) {
    return {
      stepIndex,
      stepLabel,
      nextAction:
        job.status === 'PENDING'
          ? 'Waiting for provider to accept request.'
          : 'Pending step completed.',
      isDone,
    };
  }

  if (stepIndex === 1) {
    const inspectedContent = getInspectedStepContent(job);
    return {
      stepIndex,
      stepLabel,
      ...inspectedContent,
      isDone,
    };
  }

  if (stepIndex === 2) {
    const servicePaid = !!job.laborPaid;
    const materialsPaid = hasAnyMaterialPaid(job);
    return {
      stepIndex,
      stepLabel,
      nextAction:
        servicePaid && materialsPaid
          ? 'Complete any remaining required payments.'
          : 'User must complete all required payments.',
      isDone,
    };
  }

  if (stepIndex === 3) {
    return {
      stepIndex,
      stepLabel,
      nextAction:
        job.status === 'IN_PROGRESS'
          ? 'Provider should complete the work.'
          : 'Job moves here after required payments.',
      isDone,
    };
  }

  if (stepIndex === 4) {
    return {
      stepIndex,
      stepLabel,
      nextAction:
        job.status === 'AWAITING_CONFIRMATION'
          ? 'User must confirm completion.'
          : 'Provider marks work complete to reach this step.',
      isDone,
    };
  }

  return {
    stepIndex,
    stepLabel,
    nextAction:
      job.status === 'COMPLETED' ? 'Job completed.' : 'Reach final completion.',
    isDone,
  };
}
