import { cn } from '@/lib/utils';

interface LoadingBarProps {
  className?: string;
  indeterminate?: boolean;
}

export function LoadingBar({ className, indeterminate = true }: LoadingBarProps) {
  return (
    <div
      className={cn('loading-bar-track h-1.5 w-full overflow-hidden rounded-full', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading progress"
    >
      <div
        className={cn(
          'loading-bar-fill h-full rounded-full',
          indeterminate && 'loading-bar-indeterminate',
        )}
      />
    </div>
  );
}
