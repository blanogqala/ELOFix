import { cn } from '@/lib/utils';

interface ActivityDotProps {
  className?: string;
  /** Show numeric count instead of a dot when > 0 */
  count?: number;
  'aria-label'?: string;
}

/** Orange activity indicator for jobs / tabs / nav */
export function ActivityDot({ className, count, 'aria-label': ariaLabel }: ActivityDotProps) {
  if (count != null && count <= 0) return null;
  if (count != null && count > 0) {
    return (
      <span
        className={cn(
          'inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white',
          className
        )}
        aria-label={ariaLabel ?? `${count} unread`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500', className)}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel}
    />
  );
}
