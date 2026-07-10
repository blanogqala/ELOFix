import type { PlatformHealthComponent, PlatformHealthStatus } from '@/lib/api/admin';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const STATUS_STYLES: Record<PlatformHealthStatus, { dot: string; border: string }> = {
  healthy: { dot: 'bg-emerald-500', border: 'border-emerald-500/20' },
  degraded: { dot: 'bg-amber-500', border: 'border-amber-500/30' },
  down: { dot: 'bg-destructive', border: 'border-destructive/30' },
};

type PlatformHealthPanelProps = {
  components: PlatformHealthComponent[];
  checkedAt?: string;
  isLoading?: boolean;
};

export function PlatformHealthPanel({ components, checkedAt, isLoading }: PlatformHealthPanelProps) {
  if (isLoading) {
    return (
      <div className="card-elevated flex items-center justify-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Checking platform health…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Platform Health</h2>
          <p className="text-xs text-muted-foreground">
            {checkedAt ? `Last checked ${new Date(checkedAt).toLocaleString()}` : 'System status overview'}
          </p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
        {components.map((c) => {
          const styles = STATUS_STYLES[c.status] ?? STATUS_STYLES.healthy;
          return (
            <div
              key={c.id}
              className={cn(
                'card-elevated min-w-[180px] flex-shrink-0 snap-start p-4 border transition-all hover:shadow-md',
                styles.border
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', styles.dot)} />
                <span className="font-medium text-sm">{c.label}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{c.detail}</p>
              {c.latencyMs != null && c.latencyMs > 0 && (
                <p className="text-[10px] text-muted-foreground/70 mt-1">{c.latencyMs}ms</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
