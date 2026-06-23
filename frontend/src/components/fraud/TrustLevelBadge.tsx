import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type TrustLevelId = 'elite' | 'trusted' | 'monitor' | 'restricted' | 'high_risk';

const levelStyles: Record<TrustLevelId, string> = {
  elite: 'border-success/40 bg-success/10 text-success',
  trusted: 'border-primary/40 bg-primary/10 text-primary',
  monitor: 'border-accent/50 bg-accent/20 text-foreground',
  restricted: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  high_risk: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function TrustLevelBadge({
  level,
  score,
  className,
}: {
  level: { id: TrustLevelId; label: string };
  score?: number;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn('font-normal gap-1', levelStyles[level.id], className)}>
      {level.label}
      {score != null && <span className="tabular-nums">({score})</span>}
    </Badge>
  );
}
