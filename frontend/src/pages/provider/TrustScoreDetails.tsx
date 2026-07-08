import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import apiClient from '@/api/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TrustLevelBadge } from '@/components/fraud/TrustLevelBadge';
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

function formatHistoryDateTime(at: string) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ProviderTrustScoreDetails() {
  const navigate = useNavigate();
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

  const history = useMemo(() => {
    const list = data?.history ?? [];
    return [...list].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [data?.history]);

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6 md:space-y-8 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Trust Score</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Detailed score change results</p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        {loading ? (
          <div className="card-elevated p-6 animate-pulse">
            <div className="h-6 w-40 bg-muted rounded mb-4" />
            <div className="h-3 w-full bg-muted rounded" />
          </div>
        ) : !data ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load trust score details.
          </div>
        ) : (
          <>
            <div className="card-elevated p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                  <h2 className="font-semibold text-lg">Current score</h2>
                </div>
                <TrustLevelBadge level={data.trustLevel as { id: 'elite'; label: string }} score={data.score} />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Trust score</span>
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
            </div>

            <div className="card-elevated p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-lg">Score change history</h2>
                <span className="text-sm text-muted-foreground tabular-nums">{history.length} entries</span>
              </div>

              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No score change results yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {history.map((entry) => (
                    <li
                      key={`${entry.reason}-${entry.at}-${entry.scoreAfter}`}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{entry.label}</p>
                        <p className="text-xs text-muted-foreground">{formatHistoryDateTime(entry.at)}</p>
                        <p className="text-xs text-muted-foreground">
                          Score after: <span className="font-medium tabular-nums text-foreground">{entry.scoreAfter}/100</span>
                        </p>
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
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

