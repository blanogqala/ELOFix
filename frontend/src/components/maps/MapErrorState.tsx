import { cn } from '@/lib/utils';

type MapErrorStateProps = {
  className?: string;
  title?: string;
  message: string;
  lastPosition?: { lat: number; lng: number } | null;
};

export function MapErrorState({
  className,
  title = 'Live map unavailable',
  message,
  lastPosition,
}: MapErrorStateProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground',
        className
      )}
      role="alert"
    >
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 leading-relaxed">{message}</p>
      {lastPosition ? (
        <p className="mt-2 text-xs tabular-nums">
          Last position: {lastPosition.lat.toFixed(5)}, {lastPosition.lng.toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}
