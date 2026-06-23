import type { Dispatch, SetStateAction } from 'react';
import type { Job } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UNIFIED_TIMELINE_STEPS } from '@/lib/jobStatusMapping';

const DEFAULT_STEPS = UNIFIED_TIMELINE_STEPS;
import type { UserTimelineViewState } from '@/lib/userJobTimeline';
import type { ProviderJobTimelineViewState } from '@/lib/providerJobTimeline';

export interface JobWorkflowTimelineProps {
  job: Job;
  view: UserTimelineViewState | ProviderJobTimelineViewState;
  variant: 'user' | 'provider';
  /** Override default service timeline labels (e.g. courier delivery flow). */
  steps?: readonly string[];
  getStepInsight: (stepIndex: number) => { stepLabel: string; nextAction: string };
  cancellationReasonText: string;
  lockedTimelineStep: number | null;
  setLockedTimelineStep: Dispatch<SetStateAction<number | null>>;
  hoveredTimelineStep: number | null;
  setHoveredTimelineStep: Dispatch<SetStateAction<number | null>>;
}

export function JobWorkflowTimeline({
  job,
  view,
  variant,
  steps = DEFAULT_STEPS,
  getStepInsight,
  cancellationReasonText,
  lockedTimelineStep,
  setLockedTimelineStep,
  hoveredTimelineStep,
  setHoveredTimelineStep,
}: JobWorkflowTimelineProps) {
  const isCancelled = view.terminal === 'cancelled';
  const isRejected = view.terminal === 'rejected';
  const isTerminal = isCancelled || isRejected;
  const pinIndex = view.pinIndex;
  const currentIdx = view.currentIdx;
  const allComplete = job.status === 'COMPLETED';
  const isDisputed = job.status === 'DISPUTED';
  const isAwaitingConfirmation = job.status === 'AWAITING_CONFIRMATION';

  function stepLabel(index: number, defaultLabel: string): string {
    if (index === 4 && isDisputed) return 'Dispute Opened';
    if (index === 4 && isAwaitingConfirmation) return 'Waiting for customer confirmation';
    if (index === 5 && job.status === 'COMPLETED') return 'Completed';
    return defaultLabel;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between overflow-x-auto pb-2">
          {steps.map((label, index, arr) => {
            const displayLabel = stepLabel(index, label);
            const insight = getStepInsight(index);
            const isTerminalStep = isTerminal && index === pinIndex;
            const isFutureTerminalStep = isTerminal && index > pinIndex;
            const isDisputeStep = isDisputed && index === 4;
            const isAwaitingStep = isAwaitingConfirmation && index === 4;

            let isPast: boolean;
            let isActive: boolean;
            let isFuture = false;

            if (variant === 'provider') {
              isPast = allComplete || (isTerminal ? index < pinIndex : index < currentIdx);
              isActive = !allComplete && !isTerminal && index === currentIdx;
              isFuture = !allComplete && !isTerminal && index > currentIdx;
            } else {
              isPast = isTerminal ? index < pinIndex : job.status === 'COMPLETED' || index < currentIdx;
              isActive = !isTerminal && job.status !== 'COMPLETED' && index === currentIdx;
            }

            const disableInteraction = variant === 'provider' ? isFutureTerminalStep || isFuture : isFutureTerminalStep;

            const lineSuccess =
              variant === 'provider'
                ? isTerminal
                  ? index < pinIndex
                  : isPast
                : isTerminal
                  ? index < pinIndex
                  : index < currentIdx;

            return (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center min-w-[50px]">
                  <Popover
                    open={
                      lockedTimelineStep === index ||
                      (lockedTimelineStep === null && hoveredTimelineStep === index)
                    }
                    onOpenChange={(open) => {
                      if (!open && lockedTimelineStep === index) {
                        setLockedTimelineStep(null);
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onMouseEnter={() => {
                          if (disableInteraction) return;
                          if (lockedTimelineStep === null) setHoveredTimelineStep(index);
                        }}
                        onMouseLeave={() => {
                          if (disableInteraction) return;
                          if (lockedTimelineStep === null) setHoveredTimelineStep(null);
                        }}
                        onClick={() => {
                          if (disableInteraction) return;
                          setLockedTimelineStep((current) => (current === index ? null : index));
                          setHoveredTimelineStep(null);
                        }}
                        disabled={disableInteraction}
                        className={cn(
                          'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-transform hover:scale-105 focus:outline-none',
                          disableInteraction && 'opacity-40 cursor-not-allowed',
                          isPast
                            ? 'bg-success text-success-foreground'
                            : isDisputeStep && (isActive || isPast === false && index === currentIdx)
                              ? 'bg-destructive text-destructive-foreground ring-2 ring-destructive ring-offset-2'
                            : isAwaitingStep && isActive
                              ? 'bg-amber-500 text-white ring-2 ring-amber-500 ring-offset-2'
                            : isTerminalStep
                              ? 'bg-destructive text-destructive-foreground ring-2 ring-destructive ring-offset-2'
                              : isActive
                                ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                                : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {isPast ? <Check className="h-4 w-4" /> : index + 1}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64">
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold">
                          {isTerminalStep && isCancelled ? 'Cancelled' : insight.stepLabel}
                        </p>
                        <p className="text-muted-foreground">
                          {isTerminalStep && isCancelled
                            ? `Reason: ${cancellationReasonText}`
                            : insight.nextAction}
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <span
                    className={cn(
                      'text-[10px] mt-1 text-center leading-tight max-w-[72px]',
                      isTerminalStep ? 'font-medium text-destructive' : '',
                      isDisputeStep && isActive ? 'font-medium text-destructive' : '',
                      isAwaitingStep && isActive ? 'font-medium text-amber-700 dark:text-amber-400' : '',
                      isActive && !isDisputeStep && !isAwaitingStep ? 'font-medium' : 'text-muted-foreground'
                    )}
                  >
                    {isTerminalStep
                      ? isCancelled
                        ? `Cancelled${view.terminalAt ? ` ${new Date(view.terminalAt).toLocaleDateString()}` : ''}`
                        : `Rejected${view.terminalAt ? ` ${new Date(view.terminalAt).toLocaleDateString()}` : ''}`
                      : displayLabel}
                  </span>
                </div>
                {index < arr.length - 1 && (
                  <div
                    className={cn(
                      'w-6 sm:w-10 h-0.5 mx-1',
                      lineSuccess ? 'bg-success' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
