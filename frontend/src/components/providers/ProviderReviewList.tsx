import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderReview } from '@/types';

interface ProviderReviewListProps {
  reviews: ProviderReview[];
  loading?: boolean;
  className?: string;
}

export function ProviderReviewList({ reviews, loading, className }: ProviderReviewListProps) {
  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground py-6 text-center', className)}>
        No customer reviews yet.
      </p>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {reviews.map((review) => (
        <article
          key={review.id}
          className="rounded-lg border border-border bg-muted/30 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <span className="text-sm font-medium text-primary">{review.userName.charAt(0)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-sm">{review.userName}</p>
                <time className="text-xs text-muted-foreground">
                  {new Date(review.createdAt).toLocaleDateString()}
                </time>
              </div>
              <div className="mt-0.5 flex gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={cn(
                      'h-3.5 w-3.5',
                      s <= review.rating ? 'fill-accent text-accent' : 'text-muted'
                    )}
                  />
                ))}
              </div>
              {review.jobTitle && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {review.jobTitle}
                  {review.jobCategory ? ` · ${review.jobCategory}` : ''}
                </p>
              )}
              {review.comment?.trim() && (
                <p className="mt-2 text-sm text-foreground/90 leading-relaxed">{review.comment}</p>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
