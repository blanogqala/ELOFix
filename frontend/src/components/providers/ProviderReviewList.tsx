import { Star, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProviderReview } from '@/types';
import { ReviewMediaGrid } from './MediaLightbox';

interface ProviderReviewListProps {
  reviews: ProviderReview[];
  loading?: boolean;
  className?: string;
}

function ReviewBadges({ review }: { review: ProviderReview }) {
  const isOpenDispute = review.rating === 0 && review.wasDisputed && !review.resolvedAfterDispute;
  if (!isOpenDispute && !review.resolvedAfterDispute) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {isOpenDispute && (
        <Badge variant="destructive" className="gap-1 text-xs font-normal">
          <AlertTriangle className="h-3 w-3" />
          Issue reported
        </Badge>
      )}
      {review.resolvedAfterDispute && (
        <Badge variant="secondary" className="gap-1 text-xs font-normal">
          <ShieldCheck className="h-3 w-3" />
          Fixed &amp; verified
        </Badge>
      )}
    </div>
  );
}

export function ProviderReviewList({ reviews, loading, className }: ProviderReviewListProps) {
  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
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
    <div className={cn('space-y-4', className)}>
      {reviews.map((review) => {
        const categoryLabel = review.jobCategory || review.jobTitle;
        const displayRating = Math.max(0, Math.min(5, review.rating));

        return (
          <article
            key={review.id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <span className="text-sm font-semibold text-primary">
                  {review.userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-sm">{review.userName}</p>
                  <time className="text-xs text-muted-foreground">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </time>
                </div>

                <div
                  className="mt-1 flex items-center gap-2"
                  aria-label={`${displayRating} out of 5 stars`}
                >
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={cn(
                          'h-4 w-4',
                          s <= displayRating ? 'fill-accent text-accent' : 'text-muted'
                        )}
                      />
                    ))}
                  </div>
                  {displayRating > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {displayRating}/5
                    </span>
                  )}
                </div>

                <ReviewBadges review={review} />

                {categoryLabel && (
                  <p className="mt-2 text-xs font-medium text-muted-foreground capitalize">
                    {categoryLabel}
                  </p>
                )}

                {review.comment?.trim() && (
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">{review.comment}</p>
                )}

                {review.resolvedAfterDispute &&
                ((review.disputeImages?.length ?? 0) > 0 ||
                  (review.disputeVideos?.length ?? 0) > 0) ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Before fix
                      </p>
                      <ReviewMediaGrid
                        images={review.disputeImages}
                        videos={review.disputeVideos}
                      />
                    </div>
                    {((review.images?.length ?? 0) > 0 || (review.videos?.length ?? 0) > 0) && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          After fix
                        </p>
                        <ReviewMediaGrid images={review.images} videos={review.videos} />
                      </div>
                    )}
                  </div>
                ) : (
                  <ReviewMediaGrid images={review.images} videos={review.videos} />
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
