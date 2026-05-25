import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderRatingBreakdown } from '@/types';
import { breakdownPercent, breakdownTotal } from '@/lib/providerReputation';

const STARS: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1];

interface RatingBreakdownChartProps {
  breakdown: ProviderRatingBreakdown;
  averageRating: number;
  totalReviews: number;
  className?: string;
}

export function RatingBreakdownChart({
  breakdown,
  averageRating,
  totalReviews,
  className,
}: RatingBreakdownChartProps) {
  const total = breakdownTotal(breakdown);

  return (
    <div className={cn('grid gap-6 sm:grid-cols-[minmax(0,140px)_1fr]', className)}>
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-accent bg-accent/20 p-4 text-center">
        <p className="text-4xl font-bold tabular-nums">{averageRating.toFixed(1)}</p>
        <div className="mt-1 flex gap-0.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={cn(
                'h-4 w-4',
                s <= Math.round(averageRating) ? 'fill-accent text-accent' : 'text-muted'
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {totalReviews} review{totalReviews === 1 ? '' : 's'}
        </p>
      </div>
      <div className="space-y-2">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No ratings yet — be the first to review after a job.</p>
        ) : (
          STARS.map((star) => {
            const pct = breakdownPercent(breakdown, star);
            return (
              <div key={star} className="flex items-center gap-2 text-sm">
                <span className="w-8 shrink-0 tabular-nums text-muted-foreground">{star} ★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{pct}%</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
