import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AdminAuditCenterPanel } from '@/components/admin/AdminAuditCenterPanel';
import { getAdminAnalytics, AdminAnalyticsResponse } from '@/lib/api/admin';
import { getAdminFinancialSummary, reconcileAdminProvider, type FinancialSummary } from '@/lib/api/adminFinancial';
import { useToast } from '@/hooks/use-toast';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/formatCurrency';

function PlatformMetricsPanel({
  data,
  financial,
  reconcileId,
  setReconcileId,
  reconcileBusy,
  reconcileMsg,
  runReconcile,
}: {
  data: AdminAnalyticsResponse;
  financial: FinancialSummary | null;
  reconcileId: string;
  setReconcileId: (v: string) => void;
  reconcileBusy: boolean;
  reconcileMsg: string | null;
  runReconcile: () => void;
}) {
  const { jobsByDay, revenueByDay, providersByDay, summary, from, to } = data;

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        {from} — {to} (UTC days). Revenue = gross customer payments (labor + materials, by payment date).
      </p>

      {financial && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Financial summary (ledger)</h2>
          <p className="text-xs text-muted-foreground">
            Volume ≈ released provider credits (available) + paid-out debits. Payouts from withdrawal requests.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-elevated p-4">
              <p className="text-sm text-muted-foreground">Platform volume</p>
              <p className="text-2xl font-bold">{formatCurrency(financial.totalPlatformVolume)}</p>
            </div>
            <div className="card-elevated p-4">
              <p className="text-sm text-muted-foreground">Pending payouts</p>
              <p className="text-2xl font-bold">{formatCurrency(financial.totalPendingPayouts)}</p>
            </div>
            <div className="card-elevated p-4">
              <p className="text-sm text-muted-foreground">Completed payouts</p>
              <p className="text-2xl font-bold">{formatCurrency(financial.totalCompletedPayouts)}</p>
            </div>
            <div className="card-elevated p-4">
              <p className="text-sm text-muted-foreground">Released to balance (component)</p>
              <p className="text-2xl font-bold">{formatCurrency(financial.breakdown.releasedToBalance)}</p>
            </div>
          </div>
          <div className="card-elevated p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Reconcile provider</p>
              <p className="text-xs text-muted-foreground mb-2">Use Provider.id from withdrawals list.</p>
              <Input
                placeholder="Provider UUID"
                value={reconcileId}
                onChange={(e) => setReconcileId(e.target.value)}
              />
            </div>
            <Button type="button" onClick={() => void runReconcile()} disabled={reconcileBusy}>
              {reconcileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Run reconcile'}
            </Button>
          </div>
          {reconcileMsg && <p className="text-sm text-muted-foreground">{reconcileMsg}</p>}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">Jobs created</p>
          <p className="text-2xl font-bold">{summary.totalJobs}</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">Revenue (range)</p>
          <p className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">Gross customer payments</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">Total commission</p>
          <p className="text-2xl font-bold text-accent">{formatCurrency(summary.totalCommission ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">Labor + material (7%, all paid)</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">New provider signups</p>
          <p className="text-2xl font-bold">{summary.totalProviderSignupsInRange}</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">Active approved providers</p>
          <p className="text-2xl font-bold">{summary.activeApprovedProviders}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card-elevated p-4 space-y-2">
          <h2 className="font-semibold">Jobs per day</h2>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={jobsByDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-4 space-y-2">
          <h2 className="font-semibold">Revenue per day</h2>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Amount']} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card-elevated p-4 space-y-2">
        <h2 className="font-semibold">New provider registrations per day</h2>
        <p className="text-xs text-muted-foreground">Users with role provider who registered on each day.</p>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={providersByDay}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="hsl(142 70% 40%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'audit' ? 'audit' : 'metrics';

  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [financial, setFinancial] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconcileId, setReconcileId] = useState('');
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminAnalytics();
      setData(res);
      try {
        const fin = await getAdminFinancialSummary();
        setFinancial(fin.summary);
      } catch {
        setFinancial(null);
      }
    } catch (e) {
      toast({
        title: 'Failed to load analytics',
        description: e instanceof Error ? e.message : 'Try again later.',
        variant: 'destructive',
      });
      setData(null);
      setFinancial(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const runReconcile = async () => {
    const id = reconcileId.trim();
    if (!id) {
      setReconcileMsg('Enter provider id (internal UUID).');
      return;
    }
    setReconcileBusy(true);
    setReconcileMsg(null);
    try {
      const r = await reconcileAdminProvider(id);
      setReconcileMsg(
        r.ok ? 'Ledger OK' : 'Mismatch logged to audit — view in Audit Center tab.'
      );
    } catch (e) {
      setReconcileMsg(e instanceof Error ? e.message : 'Reconcile failed');
    } finally {
      setReconcileBusy(false);
    }
  };

  const setTab = (tab: string) => {
    if (tab === 'audit') {
      setSearchParams({ tab: 'audit' });
    } else {
      setSearchParams({});
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Platform metrics and enterprise audit trail.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="metrics">Platform metrics</TabsTrigger>
            <TabsTrigger value="audit">Audit Center</TabsTrigger>
          </TabsList>

          <TabsContent value="metrics" className="mt-6">
            {loading || !data ? (
              <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                Loading analytics…
              </div>
            ) : (
              <PlatformMetricsPanel
                data={data}
                financial={financial}
                reconcileId={reconcileId}
                setReconcileId={setReconcileId}
                reconcileBusy={reconcileBusy}
                reconcileMsg={reconcileMsg}
                runReconcile={() => void runReconcile()}
              />
            )}
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <AdminAuditCenterPanel />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
