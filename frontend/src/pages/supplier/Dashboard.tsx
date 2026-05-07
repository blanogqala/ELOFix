import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSupplierMe,
  getSupplierOrders,
  getSupplierAnalyticsOverview,
  getSupplierAnalyticsBranches,
} from '@/lib/api/supplierPortal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatCurrency';
import { ClipboardList, DollarSign, ArrowRight, ShoppingCart, Building2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function SupplierDashboard() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const isBranchStaff = user?.role === 'branch_staff';

  const [dashBranchFilter, setDashBranchFilter] = useState<'all' | string>('all');
  const defaultedBranchRef = useRef(false);

  const [cityFilter, setCityFilter] = useState<string>('');
  const [searchQ, setSearchQ] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['supplier', 'profile', userId],
    queryFn: () => getSupplierMe(),
    enabled: Boolean(userId),
  });

  const branches = profile?.branches ?? [];

  const { data: overview } = useQuery({
    queryKey: ['supplier', 'analytics', 'overview', userId],
    queryFn: () => getSupplierAnalyticsOverview(),
    enabled: Boolean(userId) && !isBranchStaff,
  });

  const { data: branchAnalytics = [] } = useQuery({
    queryKey: ['supplier', 'analytics', 'branches', userId, cityFilter, searchQ],
    queryFn: () =>
      getSupplierAnalyticsBranches({
        ...(cityFilter ? { city: cityFilter } : {}),
        ...(searchQ.trim() ? { q: searchQ.trim() } : {}),
      }),
    enabled: Boolean(userId) && !isBranchStaff,
  });

  const distinctCities = useMemo(() => {
    const s = new Set<string>();
    for (const b of branchAnalytics) {
      const c = (b.city || '').trim();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [branchAnalytics]);

  useEffect(() => {
    if (user?.role === 'branch_staff' && user && 'branchId' in user && user.branchId) {
      setDashBranchFilter(user.branchId);
      defaultedBranchRef.current = true;
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'branch_staff') return;
    if (!branches.length || defaultedBranchRef.current) return;
    const first = branches.find((b) => b.isActive !== false)?.id ?? branches[0]?.id;
    if (first) {
      setDashBranchFilter(first);
      defaultedBranchRef.current = true;
    }
  }, [branches, user?.role]);

  useEffect(() => {
    if (isBranchStaff) return;
    if (dashBranchFilter !== 'all' && branches.length && !branches.some((b) => b.id === dashBranchFilter)) {
      setDashBranchFilter('all');
    }
  }, [branches, dashBranchFilter, isBranchStaff]);

  const { data: orders = [] } = useQuery({
    queryKey: ['supplier', 'orders', userId, dashBranchFilter],
    queryFn: () =>
      getSupplierOrders(undefined, {
        branchId: dashBranchFilter === 'all' ? undefined : dashBranchFilter,
      }),
    enabled: Boolean(userId),
  });

  const pending = useMemo(
    () => orders.filter((o) => String(o.fulfillmentStatus || 'PENDING').toUpperCase() === 'PENDING').length,
    [orders]
  );
  const net = useMemo(() => orders.reduce((s, o) => s + Number(o.supplierEarning ?? 0), 0), [orders]);

  const recent = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 5),
    [orders]
  );

  const storeTitle = profile?.businessName || profile?.name || 'Your store';
  const branchLabel =
    dashBranchFilter === 'all'
      ? 'All branches'
      : branches.find((b) => b.id === dashBranchFilter)?.name || 'Branch';

  if (!isBranchStaff) {
    return (
      <DashboardLayout>
        <div className="animate-fade-in space-y-6 md:space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Supplier dashboard</h1>
              <p className="text-sm text-muted-foreground sm:text-base">{storeTitle}</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link to="/supplier/branches">
                  Branches <Building2 className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link to="/supplier/orders">Open orders</Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className="card-elevated p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold sm:text-2xl">{overview?.totalBranches ?? '—'}</p>
                  <p className="text-xs text-muted-foreground sm:text-sm">Total branches</p>
                </div>
              </div>
            </Card>
            <Card className="card-elevated p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xl font-bold sm:text-2xl">
                    {overview != null ? formatCurrency(overview.sumNetEarningsAllBranches) : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground sm:text-sm">Net earnings (all branches, excl. cancelled)</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex w-full flex-col gap-1.5 sm:w-56">
              <Label className="text-xs text-muted-foreground">City</Label>
              <Select value={cityFilter || '__all__'} onValueChange={(v) => setCityFilter(v === '__all__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All cities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All cities</SelectItem>
                  {distinctCities.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-full flex-1 sm:max-w-sm">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                className="mt-1.5"
                placeholder="Branch name, address, area, manager email…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branchAnalytics.length === 0 && (
              <p className="text-sm text-muted-foreground sm:col-span-2">No branches match filters.</p>
            )}
            {branchAnalytics.map((b) => (
              <Card key={b.branchId} className="card-elevated flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{b.name}</CardTitle>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {[b.city, b.area].filter(Boolean).join(' · ') || b.address || '—'}
                  </p>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{b.totalOrders}</p>
                      <p className="text-muted-foreground">Orders</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{b.pendingOrders}</p>
                      <p className="text-muted-foreground">Pending</p>
                    </div>
                    <div>
                      <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(b.netEarnings)}
                      </p>
                      <p className="text-muted-foreground">Net</p>
                    </div>
                  </div>
                  <Button asChild className="w-full btn-accent" size="sm">
                    <Link to={`/supplier/orders?branchId=${encodeURIComponent(b.branchId)}`}>
                      Open orders <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6 md:space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Branch dashboard</h1>
            <p className="text-sm text-muted-foreground sm:text-base">{storeTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Branch: <span className="font-medium text-foreground">{branchLabel}</span>
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto shrink-0">
            <Link to="/supplier/orders">Open orders</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <ShoppingCart className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{orders.length}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Total orders</p>
              </div>
            </div>
          </Card>
          <Card className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <ClipboardList className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{pending}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Pending</p>
              </div>
            </div>
          </Card>
          <Card className="card-elevated p-4 sm:p-6 sm:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{formatCurrency(net)}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Net earnings (branch)</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-lg border-b-2 border-primary pb-2">Recent orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}
            {recent.map((o) => (
              <Link
                key={o.id}
                to={`/supplier/orders?orderId=${encodeURIComponent(o.id)}`}
                className="flex items-center justify-between gap-4 border-b border-border/70 py-3 last:border-0 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-md"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">#{o.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{formatCurrency(Number(o.supplierEarning ?? 0))}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {String(o.fulfillmentStatus || 'pending').toLowerCase()}
                  </p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
