import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { fulfillmentStatusBadgeLabel } from '@/lib/materialBatchTracking';

const STEPS = [
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'COMPLETED', label: 'Completed' },
] as const;

/** Monotonic progress for the five customer-facing fulfillment phases (DELAYED shares “out for delivery”). */
function fulfillmentRank(fulfillmentStatus: string | undefined): number {
  const u = String(fulfillmentStatus || 'PENDING').toUpperCase();
  if (u === 'FAILED' || u === 'CANCELLED') return -1;
  if (u === 'PENDING') return 0;
  if (u === 'ACCEPTED') return 1;
  if (u === 'PREPARING') return 2;
  if (u === 'READY') return 3;
  if (u === 'OUT_FOR_DELIVERY' || u === 'DELAYED') return 4;
  if (u === 'COMPLETED') return 5;
  return 0;
}

function stepDone(rank: number, stepIndex: number): boolean {
  if (rank < 0) return false;
  if (stepIndex === STEPS.length - 1) return rank >= 5;
  return rank > stepIndex + 1;
}

function stepCurrent(rank: number, stepIndex: number): boolean {
  if (rank < 0) return false;
  if (stepDone(rank, stepIndex)) return false;
  return rank === stepIndex + 1;
}

export function FulfillmentPhaseTimeline({
  fulfillmentStatus,
  className,
}: {
  fulfillmentStatus?: string;
  className?: string;
}) {
  const rank = fulfillmentRank(fulfillmentStatus);
  const terminalBad = rank < 0;

  return (
    <div className={cn('rounded-lg border border-border bg-muted/20 px-3 py-3', className)}>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Tracking timeline
      </p>
      {terminalBad ? (
        <p className="mb-2 text-xs text-destructive">
          Order {fulfillmentStatusBadgeLabel(fulfillmentStatus)} — tracking steps are frozen for this order.
        </p>
      ) : null}
      <ul className="space-y-2">
        {STEPS.map((step, i) => {
          const done = stepDone(rank, i);
          const active = stepCurrent(rank, i);
          return (
            <li key={step.key} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  done
                    ? 'border-primary bg-primary/15 text-primary'
                    : active
                      ? 'border-primary text-primary ring-2 ring-primary/25'
                      : 'border-muted-foreground/30 text-muted-foreground'
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span
                className={cn(
                  done || active ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
