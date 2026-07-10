import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TrendingDown, TrendingUp } from 'lucide-react';

type KpiCardProps = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconClassName?: string;
  delta?: number | null;
  subtitle?: string;
  className?: string;
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  iconClassName = 'bg-primary/10 text-primary',
  delta,
  subtitle,
  className,
}: KpiCardProps) {
  const hasDelta = delta != null && Number.isFinite(delta);
  const deltaPositive = hasDelta && delta > 0;
  const deltaNegative = hasDelta && delta < 0;

  return (
    <div
      className={cn(
        'card-elevated group p-4 sm:p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 sm:h-11 sm:w-11',
            iconClassName
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        {hasDelta && (
          <div
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium',
              deltaPositive && 'text-emerald-600',
              deltaNegative && 'text-destructive',
              !deltaPositive && !deltaNegative && 'text-muted-foreground'
            )}
          >
            {deltaPositive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : deltaNegative ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : null}
            {delta > 0 ? '+' : ''}
            {delta}%
          </div>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
        <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground/80">{subtitle}</p>}
      </div>
    </div>
  );
}
