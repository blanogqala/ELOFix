import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import type { MaterialBatch } from '@/types';
import { materialTrackingDisplay } from '@/lib/materialBatchTracking';

interface TrackingTimelineProps {
  batch: MaterialBatch | null;
  className?: string;
}

export function TrackingTimeline({ batch, className }: TrackingTimelineProps) {
  const { labels, checks } = materialTrackingDisplay(batch);

  return (
    <div className={cn('rounded-lg border border-border bg-muted/20 px-3 py-2', className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Order tracking</p>
      <ul className="space-y-1.5">
        {labels.map((label, i) => (
          <li key={`${label}-${i}`} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                checks[i]
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {checks[i] ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
            <span className={cn(checks[i] ? 'text-foreground font-medium' : 'text-muted-foreground')}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
