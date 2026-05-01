import type { Dispatch, SetStateAction } from 'react';
import type { Job } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UNIFIED_TIMELINE_STEPS } from '@/lib/jobStatusMapping';
import type { UserTimelineViewState } from '@/lib/userJobTimeline';
import type { ProviderJobTimelineViewState } from '@/lib/providerJobTimeline';

export interface JobWorkflowTimelineProps {
  job: Job;
  view: UserTimelineViewState | ProviderJobTimelineViewState;
  variant: 'user' | 'provider';
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

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between overflow-x-auto pb-2">
          {UNIFIED_TIMELINE_STEPS.map((label, index, arr) => {
            const insight = getStepInsight(index);
            const isTerminalStep = isTerminal && index === pinIndex;
            const isFutureTerminalStep = isTerminal && index > pinIndex;

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
                      isActive ? 'font-medium' : 'text-muted-foreground'
                    )}
                  >
                    {isTerminalStep
                      ? isCancelled
                        ? `Cancelled${view.terminalAt ? ` ${new Date(view.terminalAt).toLocaleDateString()}` : ''}`
                        : `Rejected${view.terminalAt ? ` ${new Date(view.terminalAt).toLocaleDateString()}` : ''}`
                      : label}
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
