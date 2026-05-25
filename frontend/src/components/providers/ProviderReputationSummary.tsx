import { Star, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Provider } from '@/types';
import { formatReviewCount, isNewProvider } from '@/lib/providerReputation';

interface ProviderReputationSummaryProps {
  provider: Provider;
  className?: string;
  showCompletedJobs?: boolean;
  size?: 'sm' | 'md';
}

export function ProviderReputationSummary({
  provider,
  className,
  showCompletedJobs = true,
  size = 'sm',
}: ProviderReputationSummaryProps) {
  const reviewCount = provider.totalReviews ?? provider.reviews?.length ?? 0;
  const isNew = isNewProvider(provider);
  const starClass = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  const textClass = size === 'md' ? 'text-base' : 'text-sm';

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', textClass, className)}>
      {isNew ? (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-primary">New Provider</span>
          <span className="text-xs text-muted-foreground">Recently joined EloFix</span>
          <span className="text-xs text-muted-foreground italic">No ratings yet</span>
        </div>
      ) : (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Star className={cn(starClass, 'fill-accent text-accent shrink-0')} aria-hidden />
          <span className="font-semibold">{provider.rating.toFixed(1)}</span>
          <span className="text-muted-foreground">· {formatReviewCount(reviewCount)}</span>
        </span>
      )}
      {showCompletedJobs && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Briefcase className={cn(starClass, 'text-primary shrink-0')} aria-hidden />
          <span>
            {provider.completedJobs.toLocaleString()} job{provider.completedJobs === 1 ? '' : 's'} completed
          </span>
        </span>
      )}
    </div>
  );
}
