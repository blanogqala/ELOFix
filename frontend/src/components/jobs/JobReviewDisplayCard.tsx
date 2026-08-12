import { Star, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ReviewMediaGrid } from '@/components/providers/MediaLightbox';

type ReviewLike = {
  rating: number;
  comment?: string | null;
  images?: string[];
  videos?: string[];
  createdAt?: string | null;
};

type Props = {
  review: ReviewLike;
  /** Customer sees "Your Review"; provider sees "Customer Review" */
  variant?: 'customer' | 'provider';
  className?: string;
  showSuccessBanner?: boolean;
};

function formatReviewedOn(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function JobReviewDisplayCard({
  review,
  variant = 'customer',
  className,
  showSuccessBanner = false,
}: Props) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0)));
  const images = Array.isArray(review.images) ? review.images : [];
  const videos = Array.isArray(review.videos) ? review.videos : [];
  const hasMedia = images.length > 0 || videos.length > 0;
  const reviewedOn = formatReviewedOn(review.createdAt);
  const title = variant === 'provider' ? 'Customer Review' : 'Your Review';

  return (
    <Card className={cn('border-border', className)}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        {showSuccessBanner && variant === 'customer' ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Review submitted successfully
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={cn(
                'h-5 w-5',
                star <= rating ? 'fill-accent text-accent' : 'text-muted-foreground'
              )}
              aria-hidden
            />
          ))}
        </div>
        {review.comment ? (
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            &ldquo;{review.comment}&rdquo;
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No written comment</p>
        )}
        {hasMedia ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {variant === 'provider' ? 'Photos from customer' : 'Photos'}
            </p>
            <ReviewMediaGrid images={images} videos={videos} />
          </div>
        ) : null}
        {reviewedOn ? (
          <p className="text-xs text-muted-foreground">Reviewed on {reviewedOn}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
