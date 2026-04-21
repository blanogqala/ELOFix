import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { getAdminAnalytics, AdminAnalyticsResponse } from '@/lib/api/admin';
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

function formatZAR(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n);
}

export default function AdminAnalytics() {
  const { toast } = useToast();
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminAnalytics();
      setData(res);
    } catch (e) {
      toast({
        title: 'Failed to load analytics',
        description: e instanceof Error ? e.message : 'Try again later.',
        variant: 'destructive',
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading analytics…
        </div>
      </DashboardLayout>
    );
  }

  const { jobsByDay, revenueByDay, providersByDay, summary, from, to } = data;

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            {from} — {to} (UTC days). Revenue = paid labor + paid materials (by payment date).
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-elevated p-4">
            <p className="text-sm text-muted-foreground">Jobs created</p>
            <p className="text-2xl font-bold">{summary.totalJobs}</p>
          </div>
          <div className="card-elevated p-4">
            <p className="text-sm text-muted-foreground">Revenue (range)</p>
            <p className="text-2xl font-bold">{formatZAR(summary.totalRevenue)}</p>
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
                  <Tooltip formatter={(v: number) => formatZAR(v)} />
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
    </DashboardLayout>
  );
}
