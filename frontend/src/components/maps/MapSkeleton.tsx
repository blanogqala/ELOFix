import { cn } from '@/lib/utils';

type MapSkeletonProps = {
  className?: string;
  message?: string;
};

export function MapSkeleton({ className, message = 'Loading map…' }: MapSkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg border border-border bg-muted/20 p-6 text-sm text-muted-foreground',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
