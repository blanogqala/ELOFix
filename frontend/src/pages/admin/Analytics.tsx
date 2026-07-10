import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AnalyticsFilterBar } from '@/components/admin/analytics/AnalyticsFilterBar';
import { ExecutiveKpiGrid } from '@/components/admin/analytics/ExecutiveKpiGrid';
import { AnalyticsChartsGrid } from '@/components/admin/analytics/AnalyticsChartsGrid';
import { PlatformHealthPanel } from '@/components/admin/analytics/PlatformHealthPanel';
import { SecurityActivityCenter } from '@/components/admin/analytics/SecurityActivityCenter';
import {
  getAdminAnalytics,
  getAdminAnalyticsFilterOptions,
  getAdminPlatformHealth,
} from '@/lib/api/admin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import {
  type AnalyticsFilterState,
  applyPresetDates,
  filtersFromSearchParams,
  filtersToSearchParams,
  toAnalyticsApiParams,
} from '@/components/admin/analytics/analyticsFilters';

function useAnalyticsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const f = filtersFromSearchParams(searchParams);
    if (!f.from || !f.to) {
      const { from, to } = applyPresetDates(f.preset || '30d');
      return { ...f, from: f.from || from, to: f.to || to };
    }
    return f;
  }, [searchParams]);

  const setFilters = useCallback(
    (next: AnalyticsFilterState) => {
      const sp = filtersToSearchParams(next);
      const tab = searchParams.get('tab');
      if (tab === 'security') sp.set('tab', 'security');
      setSearchParams(sp, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return { filters, setFilters };
}

export default function AdminAnalytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab =
    searchParams.get('tab') === 'security' || searchParams.get('tab') === 'audit'
      ? 'security'
      : 'overview';
  const { filters, setFilters } = useAnalyticsFilters();

  const apiParams = useMemo(() => toAnalyticsApiParams(filters), [filters]);

  const {
    data: analytics,
    isLoading: analyticsLoading,
    isFetching: analyticsFetching,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['admin', 'analytics', apiParams],
    queryFn: () => getAdminAnalytics(apiParams),
  });

  const { data: filterOptions } = useQuery({
    queryKey: ['admin', 'analytics-filter-options'],
    queryFn: getAdminAnalyticsFilterOptions,
    staleTime: 5 * 60 * 1000,
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['admin', 'platform-health'],
    queryFn: getAdminPlatformHealth,
    refetchInterval: 60_000,
  });

  const setTab = (tab: string) => {
    const sp = new URLSearchParams(searchParams);
    if (tab === 'security') {
      sp.set('tab', 'security');
    } else {
      sp.delete('tab');
    }
    setSearchParams(sp, { replace: true });
  };

  const rangeLabel =
    analytics?.from && analytics?.to ? `${analytics.from} — ${analytics.to}` : 'Loading range…';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Business KPIs and platform intelligence · {rangeLabel}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="security">Security & Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <AnalyticsFilterBar
              filters={filters}
              onChange={setFilters}
              filterOptions={filterOptions ?? null}
              onRefresh={() => void refetchAnalytics()}
              isRefreshing={analyticsFetching}
            />

            {analyticsLoading || !analytics ? (
              <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                Loading dashboard…
              </div>
            ) : (
              <>
                <ExecutiveKpiGrid summary={analytics.summary} />
                <AnalyticsChartsGrid data={analytics} />
                <PlatformHealthPanel
                  components={health?.components ?? []}
                  checkedAt={health?.checkedAt}
                  isLoading={healthLoading}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <SecurityActivityCenter />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
