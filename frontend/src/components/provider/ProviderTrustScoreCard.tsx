import { useEffect, useState } from 'react';
import { ShieldCheck, TrendingUp, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { TrustLevelBadge } from '@/components/fraud/TrustLevelBadge';
import apiClient from '@/api/client';
import { cn } from '@/lib/utils';

type TrustScoreHistoryEntry = {
  reason: string;
  label: string;
  delta: number;
  scoreAfter: number;
  at: string;
};

type TrustScoreResponse = {
  score: number;
  trustLevel: { id: string; label: string };
  disputeCount: number;
  refundCount: number;
  completedJobs: number;
  positiveReviews: number;
  recommendations: string[];
  isHighRisk?: boolean;
  history?: TrustScoreHistoryEntry[];
};

function formatHistoryDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function formatHistoryDate(at: string) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProviderTrustScoreCard({ className }: { className?: string }) {
  const [data, setData] = useState<TrustScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<{ success: boolean; trustScore: TrustScoreResponse }>('/provider/trust-score')
      .then((res) => {
        if (!cancelled) setData(res.data.trustScore);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className={cn('card-elevated p-6 animate-pulse', className)}>
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="h-3 w-full bg-muted rounded" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={cn('card-elevated p-6 space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="font-semibold text-lg">Trust Score</h2>
        </div>
        <TrustLevelBadge level={data.trustLevel as { id: 'elite'; label: string }} score={data.score} />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Current score</span>
          <span className="font-semibold tabular-nums">{data.score}/100</span>
        </div>
        <Progress value={data.score} className="h-2" />
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg border p-2">
          <p className="font-semibold tabular-nums">{data.completedJobs}</p>
          <p className="text-xs text-muted-foreground">Jobs done</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="font-semibold tabular-nums">{data.disputeCount}</p>
          <p className="text-xs text-muted-foreground">Disputes</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="font-semibold tabular-nums">{data.refundCount}</p>
          <p className="text-xs text-muted-foreground">Refunds</p>
        </div>
      </div>

      {data.history && data.history.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Recent score changes</p>
          <ul className="space-y-2 text-sm">
            {data.history.map((entry) => (
              <li
                key={`${entry.reason}-${entry.at}-${entry.scoreAfter}`}
                className="flex items-start justify-between gap-3 rounded-lg border p-2"
              >
                <div className="min-w-0">
                  <p className="font-medium">{entry.label}</p>
                  <p className="text-xs text-muted-foreground">{formatHistoryDate(entry.at)}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 font-semibold tabular-nums',
                    entry.delta > 0 ? 'text-green-600' : entry.delta < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {formatHistoryDelta(entry.delta)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : data.score < 75 ? (
        <p className="text-sm text-muted-foreground">
          Score changes from verification and security checks may not appear in the job/dispute counters above.
        </p>
      ) : null}

      {data.isHighRisk && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Withdrawals are paused while your account is High Risk. Follow the recommendations below.</p>
        </div>
      )}

      {data.recommendations.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1">
            <TrendingUp className="h-4 w-4 text-primary" /> Improve your score
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            {data.recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
