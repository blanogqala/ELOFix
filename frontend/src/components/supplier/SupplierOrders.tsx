import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSupplierOrders,
  getSupplierMe,
  patchSupplierOrderFulfillment,
  postSupplierOrderNote,
  postSupplierEnsureTracking,
  cancelSupplierOrder,
  getSupplierAnalyticsBranches,
  getSupplierAnalyticsOverview,
  type SupplierMaterialOrderLine,
} from '@/lib/api/supplierPortal';
import { postTrackingLocation } from '@/lib/api/tracking';
import { createLocationSendState, markLocationSent, shouldSendLocation } from '@/lib/geolocationSendGate';
import type { MaterialFulfillmentStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/formatCurrency';
import { buildPublicTrackingUrl } from '@/lib/publicTrackingUrl';
import { cn } from '@/lib/utils';
import { socket, ensureSocketAuthAndConnect } from '@/lib/socket';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Search, ArrowLeft, Copy, MapPin, Building2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import { useOrderLocationSocket } from '@/hooks/useOrderLocationSocket';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/30',
  ACCEPTED: 'bg-blue-500/15 text-blue-900 dark:text-blue-100 border-blue-500/30',
  PREPARING: 'bg-violet-500/15 text-violet-900 dark:text-violet-100 border-violet-500/30',
  READY: 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-100 border-emerald-500/30',
  OUT_FOR_DELIVERY: 'bg-sky-500/15 text-sky-900 dark:text-sky-100 border-sky-500/30',
  COMPLETED: 'bg-muted text-muted-foreground border-border',
  FAILED: 'bg-red-500/15 text-red-900 dark:text-red-100 border-red-500/35',
  DELAYED: 'bg-amber-500/15 text-amber-950 dark:text-amber-100 border-amber-500/40',
  CANCELLED: 'bg-muted text-muted-foreground border-border',
};

function SupplierPortalOrderKpis({
  totalOrders,
  totalPending,
  netEarnings,
}: {
  totalOrders: number | null | undefined;
  totalPending: number | null | undefined;
  netEarnings: number | null | undefined;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total orders</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{totalOrders ?? '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Across your scope</p>
        </CardContent>
      </Card>
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Pending orders</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{totalPending ?? '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Awaiting acceptance</p>
        </CardContent>
      </Card>
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Net earnings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {netEarnings == null ? '—' : formatCurrency(netEarnings)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Excludes cancelled</p>
        </CardContent>
      </Card>
    </div>
  );
}

function displayStatus(st: string | undefined): string {
  const u = String(st || 'PENDING').toUpperCase();
  if (u === 'PREPARING') return 'In progress';
  if (u === 'OUT_FOR_DELIVERY') return 'Out for delivery';
  if (u === 'COMPLETED') return 'Delivered';
  if (u === 'AT_DESTINATION') return 'At destination';
  return u.toLowerCase().replace(/_/g, ' ');
}

function nextFulfillmentStatus(s: string | undefined): MaterialFulfillmentStatus | null {
  switch (String(s || 'PENDING').toUpperCase()) {
    case 'PENDING':
      return 'ACCEPTED';
    case 'ACCEPTED':
      return 'PREPARING';
    case 'PREPARING':
      return 'READY';
    case 'READY':
      return 'OUT_FOR_DELIVERY';
    case 'OUT_FOR_DELIVERY':
      return 'COMPLETED';
    default:
      return null;
  }
}

function actionButtonLabel(s: string | undefined): string {
  switch (String(s || 'PENDING').toUpperCase()) {
    case 'PENDING':
      return 'Accept order';
    case 'ACCEPTED':
      return 'Start preparing';
    case 'PREPARING':
      return 'Mark ready';
    case 'READY':
      return 'Out for delivery';
    case 'OUT_FOR_DELIVERY':
      return 'Mark delivered';
    default:
      return '—';
  }
}

type FilterKey = 'all' | 'pending' | 'in_progress' | 'ready' | 'completed';

function matchesFilter(st: string | undefined, filter: FilterKey): boolean {
  const u = String(st || 'PENDING').toUpperCase();
  switch (filter) {
    case 'all':
      return true;
    case 'pending':
      return u === 'PENDING';
    case 'in_progress':
      return u === 'ACCEPTED' || u === 'PREPARING' || u === 'OUT_FOR_DELIVERY';
    case 'ready':
      return u === 'READY';
    case 'completed':
      return u === 'COMPLETED';
    default:
      return true;
  }
}

function formatDeliverySummary(order: SupplierMaterialOrderLine): string {
  const dt = order.deliveryType || (order as { delivery?: { type?: string } }).delivery?.type;
  if (dt === 'SELF') return 'Customer pickup at store';
  if (dt === 'STORE_DELIVERY') return 'Store delivery';
  if (dt === 'DELIVERY_PROVIDER') return 'Third-party delivery';
  if (String(dt).includes('SELF')) return 'Customer pickup';
  return 'See order details';
}

function lineQty(line: Record<string, unknown>): number {
  return Number(line.qty ?? line.quantity ?? 0);
}

function lineUnitPrice(line: Record<string, unknown>): number {
  return Number(line.unitPrice ?? line.price ?? 0);
}

function buildTimeline(order: SupplierMaterialOrderLine): { key: string; label: string; at?: string }[] {
  const raw = Array.isArray(order.supplierActivity) ? [...order.supplierActivity] : [];
  raw.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return ta - tb;
  });
  const rows: { key: string; label: string; at?: string }[] = [];
  const hasCreated = raw.some((e) => e.type === 'created');
  if (order.createdAt && !hasCreated) {
    rows.push({
      key: 'placed',
      label: 'Order placed',
      at: order.createdAt,
    });
  }
  for (const e of raw) {
    if (e.type === 'created') {
      rows.push({
        key: `created-${e.createdAt}`,
        label: 'Order created',
        at: e.createdAt,
      });
      continue;
    }
    if (e.type === 'status' && e.status) {
      const actorSuffix = String((e as { actor?: string }).actor || '') === 'provider' ? ' (courier)' : '';
      rows.push({
        key: `s-${e.createdAt}-${e.status}`,
        label: `Status → ${displayStatus(e.status)}${actorSuffix}`,
        at: e.createdAt,
      });
    } else if (e.type === 'note' && e.message) {
      rows.push({
        key: `n-${e.createdAt}-${e.message.slice(0, 24)}`,
        label: `Note: ${e.message}`,
        at: e.createdAt,
      });
    } else if (e.type === 'cancellation') {
      const actor = String((e as { actor?: string }).actor || 'system');
      const reason = (e as { reason?: string }).reason;
      rows.push({
        key: `c-${e.createdAt}-${actor}`,
        label: `Cancelled by ${actor}${reason ? `: ${reason}` : ''}`,
        at: e.createdAt,
      });
    }
  }
  rows.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
  return rows;
}

export function SupplierOrders({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isBranchStaff = user?.role === 'branch_staff';
  const isSupplierReadOnly = user?.role === 'supplier';
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get('orderId') ?? '';
  const branchIdFromUrl = searchParams.get('branchId') ?? '';
  const [ordersBranchFilter, setOrdersBranchFilter] = useState<'all' | string>('all');
  const [supplierBrowse, setSupplierBrowse] = useState<'branches' | 'list'>(() =>
    branchIdFromUrl ? 'list' : 'branches'
  );
  const defaultedBranchRef = useRef(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [noteDraft, setNoteDraft] = useState('');
  const [cancelReasonDraft, setCancelReasonDraft] = useState('');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['supplier', 'profile', userId],
    queryFn: () => getSupplierMe(),
    enabled: Boolean(userId),
  });

  const branches = profile?.branches ?? [];

  const [ordCityFilter, setOrdCityFilter] = useState('');
  const [ordSearchQ, setOrdSearchQ] = useState('');

  const { data: orderBranchCards = [] } = useQuery({
    queryKey: ['supplier', 'analytics', 'branches', 'orders-page', userId, ordCityFilter, ordSearchQ],
    queryFn: () =>
      getSupplierAnalyticsBranches({
        ...(ordCityFilter ? { city: ordCityFilter } : {}),
        ...(ordSearchQ.trim() ? { q: ordSearchQ.trim() } : {}),
      }),
    enabled: Boolean(userId) && isSupplierReadOnly,
  });

  const { data: portalOverview } = useQuery({
    queryKey: ['supplier', 'analytics-overview', userId],
    queryFn: () => getSupplierAnalyticsOverview(),
    enabled: Boolean(userId) && (isBranchStaff || isSupplierReadOnly),
  });

  const distinctOrdCities = useMemo(() => {
    const s = new Set<string>();
    for (const b of orderBranchCards) {
      const c = (b.city || '').trim();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [orderBranchCards]);

  useEffect(() => {
    if (!isSupplierReadOnly) return;
    if (branchIdFromUrl) {
      setOrdersBranchFilter(branchIdFromUrl);
      setSupplierBrowse('list');
      defaultedBranchRef.current = true;
    }
  }, [isSupplierReadOnly, branchIdFromUrl]);

  useEffect(() => {
    if (!isBranchStaff || !user || user.role !== 'branch_staff') return;
    const bid = user.branchId;
    if (bid) {
      setOrdersBranchFilter(bid);
      defaultedBranchRef.current = true;
    }
  }, [isBranchStaff, user]);

  useEffect(() => {
    if (isBranchStaff) return;
    if (isSupplierReadOnly) return;
    if (!branches.length || defaultedBranchRef.current) return;
    const first = branches.find((b) => b.isActive !== false)?.id ?? branches[0]?.id;
    if (first) {
      setOrdersBranchFilter(first);
      defaultedBranchRef.current = true;
    }
  }, [branches, isBranchStaff, isSupplierReadOnly]);

  useEffect(() => {
    if (isBranchStaff) return;
    if (ordersBranchFilter !== 'all' && branches.length && !branches.some((b) => b.id === ordersBranchFilter)) {
      setOrdersBranchFilter('all');
    }
  }, [branches, ordersBranchFilter, isBranchStaff]);

  const shouldLoadOrders =
    Boolean(userId) && (isBranchStaff || !isSupplierReadOnly || (isSupplierReadOnly && supplierBrowse === 'list'));

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['supplier', 'orders', userId, ordersBranchFilter],
    queryFn: () =>
      getSupplierOrders(undefined, {
        branchId: ordersBranchFilter === 'all' ? undefined : ordersBranchFilter,
      }),
    enabled: shouldLoadOrders,
  });

  const selected = useMemo(() => {
    if (!orderIdFromUrl) return null;
    return orders.find((o) => o.id === orderIdFromUrl) ?? null;
  }, [orders, orderIdFromUrl]);

  useEffect(() => {
    if (!orderIdFromUrl || !orders.length) return;
    if (!orders.some((o) => o.id === orderIdFromUrl)) {
      const next = new URLSearchParams(searchParams);
      next.delete('orderId');
      setSearchParams(next, { replace: true });
    }
  }, [orders, orderIdFromUrl, setSearchParams, searchParams]);

  useEffect(() => {
    if (!userId) return;
    ensureSocketAuthAndConnect();
    const onNew = () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'orders', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'analytics-overview', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'analytics', 'branches'] });
    };
    socket.on('supplier:material_order:new', onNew);
    return () => {
      socket.off('supplier:material_order:new', onNew);
    };
  }, [queryClient, userId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (!matchesFilter(String(o.fulfillmentStatus), filter)) return false;
      if (!q) return true;
      const id = String(o.id).toLowerCase();
      const name = String(o.customerName || '').toLowerCase();
      const email = String(o.customerEmail || '').toLowerCase();
      return id.includes(q) || name.includes(q) || email.includes(q);
    });
  }, [orders, search, filter]);

  const patchMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MaterialFulfillmentStatus }) =>
      patchSupplierOrderFulfillment(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'orders', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'profile', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'analytics-overview', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'analytics', 'branches'] });
      toast({ title: 'Order updated' });
    },
    onError: (e: Error) => {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    },
  });

  const noteMut = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) => postSupplierOrderNote(id, message),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'orders', userId] });
      setNoteDraft('');
      toast({ title: 'Update added' });
    },
    onError: (e: Error) => {
      toast({ title: 'Could not add note', description: e.message, variant: 'destructive' });
    },
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelSupplierOrder(id, reason),
    onSuccess: ({ refund }) => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'orders', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'analytics-overview', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'analytics', 'branches'] });
      setCancelReasonDraft('');
      setCancelDialogOpen(false);
      toast({
        title: 'Order cancelled',
        description: `Refund recorded: ${formatCurrency(Number(refund?.amount || 0))}`,
      });
    },
    onError: (e: Error) => {
      toast({ title: 'Cancel failed', description: e.message, variant: 'destructive' });
    },
  });

  const openSupplierBranchOrders = (branchId: string) => {
    setOrdersBranchFilter(branchId);
    setSupplierBrowse('list');
    setSearchParams({ branchId });
  };

  const backToSupplierBranchCards = () => {
    setSupplierBrowse('branches');
    setOrdersBranchFilter('all');
    setSearchParams({});
  };

  const openOrder = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('orderId', id);
    if (isSupplierReadOnly && ordersBranchFilter !== 'all') {
      next.set('branchId', ordersBranchFilter);
    }
    setSearchParams(next);
  };

  const backToList = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('orderId');
    setSearchParams(next);
  };

  if (isSupplierReadOnly && supplierBrowse === 'branches' && !orderIdFromUrl) {
    return (
      <div className="space-y-4">
        <SupplierPortalOrderKpis
          totalOrders={portalOverview?.totalOrders}
          totalPending={portalOverview?.totalPendingOrders}
          netEarnings={portalOverview?.sumNetEarningsAllBranches}
        />
        <p className="text-sm text-muted-foreground">
          Read-only overview. Pick a branch to view its orders.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex w-full flex-col gap-1.5 sm:w-56">
            <Label className="text-xs text-muted-foreground">City</Label>
            <Select value={ordCityFilter || '__all__'} onValueChange={(v) => setOrdCityFilter(v === '__all__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All cities</SelectItem>
                {distinctOrdCities.map((c) => (
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
              placeholder="Branch, address, area, manager email…"
              value={ordSearchQ}
              onChange={(e) => setOrdSearchQ(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderBranchCards.length === 0 && (
            <p className="text-sm text-muted-foreground sm:col-span-2">No branches match filters.</p>
          )}
          {orderBranchCards.map((b) => (
            <Card key={b.branchId} className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0" />
                  {b.name}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {[b.city, b.area].filter(Boolean).join(' · ') || b.address || '—'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Orders</span>
                  <span className="font-medium">{b.totalOrders}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Pending</span>
                  <span className="font-medium">{b.pendingOrders}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Net</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(b.netEarnings)}
                  </span>
                </div>
                <Button type="button" size="sm" className="w-full mt-2 btn-accent" onClick={() => openSupplierBranchOrders(b.branchId)}>
                  View orders
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isLoading && shouldLoadOrders) {
    return <p className="text-sm text-muted-foreground">Loading orders…</p>;
  }

  if (orders.length === 0 && shouldLoadOrders) {
    return (
      <div className="space-y-4">
        {(isBranchStaff || isSupplierReadOnly) && (
          <SupplierPortalOrderKpis
            totalOrders={portalOverview?.totalOrders}
            totalPending={portalOverview?.totalPendingOrders}
            netEarnings={portalOverview?.sumNetEarningsAllBranches}
          />
        )}
      <Card className="card-elevated border-dashed">
        <CardHeader>
          <CardTitle className="text-base">No orders yet</CardTitle>
          <CardDescription>New customer orders appear here in real time.</CardDescription>
        </CardHeader>
        {isSupplierReadOnly && (
          <CardContent>
            <Button type="button" variant="outline" size="sm" onClick={backToSupplierBranchCards}>
              Back to branches
            </Button>
          </CardContent>
        )}
      </Card>
      </div>
    );
  }

  const filterChips: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'ready', label: 'Ready' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <div className="space-y-4">
      {(isBranchStaff || isSupplierReadOnly) && (
        <SupplierPortalOrderKpis
          totalOrders={portalOverview?.totalOrders}
          totalPending={portalOverview?.totalPendingOrders}
          netEarnings={portalOverview?.sumNetEarningsAllBranches}
        />
      )}
      {!selected && isSupplierReadOnly && supplierBrowse === 'list' && (
        <Button type="button" variant="ghost" size="sm" className="gap-1 -ml-2" onClick={backToSupplierBranchCards}>
          <ArrowLeft className="h-4 w-4" />
          All branches
        </Button>
      )}
      {!selected && (
        <>
          {branches.length > 0 && !isBranchStaff && (
            <div className="flex flex-col gap-2 sm:max-w-xs">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Branch</span>
              <Select
                value={ordersBranchFilter}
                onValueChange={(v) => setOrdersBranchFilter(v as 'all' | string)}
                disabled={isSupplierReadOnly}
              >
                <SelectTrigger aria-label="Filter orders by branch">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {!isSupplierReadOnly && <SelectItem value="all">All branches</SelectItem>}
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.displayName || b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by order ID, name, or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                aria-label="Search orders"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {filterChips.map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                variant={filter === key ? 'default' : 'outline'}
                size="sm"
                className={cn(filter === key ? 'btn-accent' : '')}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </>
      )}

      {!selected ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders match filters.</p>
          ) : (
            filtered.map((o) => {
              const st = String(o.fulfillmentStatus || 'PENDING').toUpperCase();
              const items = Array.isArray(o.items) ? o.items : [];
              const total = Number(o.total ?? o.materialsSubtotal ?? 0);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => openOrder(o.id)}
                  className={cn(
                    'w-full rounded-lg border-2 border-primary bg-card text-left shadow-sm transition-colors',
                    'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-xs text-muted-foreground">#{String(o.id).slice(0, 8)}</p>
                      <Badge variant="outline" className={cn('shrink-0 capitalize border', STATUS_BADGE[st] || STATUS_BADGE.PENDING)}>
                        {displayStatus(st)}
                      </Badge>
                    </div>
                    <p className="font-medium leading-tight">{o.customerName || 'Customer'}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
                      <span>{formatCurrency(total)}</span>
                      <span>
                        {o.createdAt ? new Date(o.createdAt).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }) : ''}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <DetailPanel
          userId={userId}
          readOnly={isSupplierReadOnly}
          order={selected}
          onBack={backToList}
          onPatch={(status) => patchMut.mutate({ id: selected.id, status })}
          patching={patchMut.isPending}
          noteDraft={noteDraft}
          onNoteChange={setNoteDraft}
          onSubmitNote={() => {
            const t = noteDraft.trim();
            if (!t) return;
            noteMut.mutate({ id: selected.id, message: t });
          }}
          notePending={noteMut.isPending}
          cancelReasonDraft={cancelReasonDraft}
          onCancelReasonChange={setCancelReasonDraft}
          cancelDialogOpen={cancelDialogOpen}
          onCancelDialogOpenChange={(open) => {
            setCancelDialogOpen(open);
            if (!open) setCancelReasonDraft('');
          }}
          onOpenCancelDialog={() => setCancelDialogOpen(true)}
          onCancelOrder={() => {
            const reason = cancelReasonDraft.trim();
            if (!reason) {
              toast({ title: 'Reason required', description: 'Enter cancellation reason first.', variant: 'destructive' });
              return;
            }
            cancelMut.mutate({ id: selected.id, reason });
          }}
          cancelPending={cancelMut.isPending}
        />
      )}
    </div>
  );
}

function DetailPanel({
  userId,
  readOnly = false,
  order,
  onBack,
  onPatch,
  patching,
  noteDraft,
  onNoteChange,
  onSubmitNote,
  notePending,
  cancelReasonDraft,
  onCancelReasonChange,
  cancelDialogOpen,
  onCancelDialogOpenChange,
  onOpenCancelDialog,
  onCancelOrder,
  cancelPending,
}: {
  userId: string;
  readOnly?: boolean;
  order: SupplierMaterialOrderLine;
  onBack: () => void;
  onPatch: (s: MaterialFulfillmentStatus) => void;
  patching: boolean;
  noteDraft: string;
  onNoteChange: (v: string) => void;
  onSubmitNote: () => void;
  notePending: boolean;
  cancelReasonDraft: string;
  onCancelReasonChange: (v: string) => void;
  cancelDialogOpen: boolean;
  onCancelDialogOpenChange: (open: boolean) => void;
  onOpenCancelDialog: () => void;
  onCancelOrder: () => void;
  cancelPending: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const st = String(order.fulfillmentStatus || 'PENDING').toUpperCase();
  const next = nextFulfillmentStatus(st);
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.total ?? order.materialsSubtotal ?? 0);
  const src = String((order as { source?: string }).source || '');
  const jobId = (order as { jobId?: string }).jobId;
  const timeline = buildTimeline(order);
  const isStoreDelivery = String(order.deliveryType || '').toUpperCase() === 'STORE_DELIVERY';
  const trackSocketEnabled = st === 'OUT_FOR_DELIVERY' && isStoreDelivery && !readOnly;
  const canCancelOrder = !['CANCELLED', 'COMPLETED', 'FAILED'].includes(st);

  const { liveLat, liveLng, lastPingAtMs, pollFailed, isSocketReconnecting } = useOrderLocationSocket({
    orderId: order.id,
    enabled: trackSocketEnabled,
  });

  const ensureTrackMut = useMutation({
    mutationFn: () => postSupplierEnsureTracking(order.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'orders', userId] });
      toast({
        title: 'Tracking ready',
        description: 'Session is active. Copy or share the link so the driver can open it in a browser.',
      });
    },
    onError: (e: Error) => {
      toast({ title: 'Could not start tracking', description: e.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (readOnly) return;
    const dt = String(order.deliveryType || '').toUpperCase();
    if (dt !== 'STORE_DELIVERY' || st !== 'OUT_FOR_DELIVERY') return;
    const tid = order.activeTrackingId;
    if (!tid || !navigator.geolocation) return;
    const token = order.activeTrackingToken ?? null;
    const sendState = createLocationSendState();
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!shouldSendLocation(now, lat, lng, sendState)) return;
        markLocationSent(now, lat, lng, sendState);
        void postTrackingLocation(tid, lat, lng, token);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 12000 }
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, [readOnly, st, order.deliveryType, order.activeTrackingId, order.activeTrackingToken]);

  return (
    <Card className="card-elevated overflow-hidden">
      <CardHeader className="border-b-2 border-primary bg-background/80 py-4">
        <div className="mb-3">
          <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to orders
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Order #{order.id.slice(0, 8)}</CardTitle>
            <CardDescription className="mt-1">
              {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
            </CardDescription>
            {src === 'job_materials' && jobId && (
              <p className="mt-1 text-xs text-muted-foreground">Job-linked · Job #{jobId.slice(0, 8)}</p>
            )}
          </div>
          <Badge variant="outline" className={cn('capitalize border', STATUS_BADGE[st] || STATUS_BADGE.PENDING)}>
            {displayStatus(st)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 ">
        {readOnly && (
          <p className="rounded-md border border-muted bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Read-only view. Branch staff accept, fulfill, and update orders at the branch.
          </p>
        )}
        <div className="grid grid-cols-2 gap-0">
        {next && !readOnly && (
          <div className="col-span-1">
            <Button
              type="button"
              className="btn-accent w-full sm:w-auto"
              disabled={patching || !next}
              onClick={() => next && onPatch(next)}
            >
              {actionButtonLabel(st)}
            </Button>
          </div>
        )}

        {canCancelOrder && !readOnly && (
          <>
            <div className="ml-auto">
              <Button type="button" variant="destructive" size="sm" disabled={cancelPending} onClick={onOpenCancelDialog}>
                Cancel Order
              </Button>
            </div>
            <Dialog open={cancelDialogOpen} onOpenChange={onCancelDialogOpenChange}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancel Order</DialogTitle>
                  <DialogDescription>
                    Enter a reason before cancelling this order.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="supplier-cancel-reason">Reason for cancellation</Label>
                  <Textarea
                    id="supplier-cancel-reason"
                    rows={3}
                    placeholder="Reason is required"
                    value={cancelReasonDraft}
                    onChange={(e) => onCancelReasonChange(e.target.value)}
                    className="resize-none"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onCancelDialogOpenChange(false)}>
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={cancelPending || !cancelReasonDraft.trim()}
                    onClick={onCancelOrder}
                  >
                    {cancelPending ? 'Cancelling…' : 'Submit cancellation'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
        </div>
        {st === 'CANCELLED' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm space-y-1">
            <p className="font-medium">Cancelled</p>
            {(order as { cancelledBy?: string }).cancelledBy && (
              <p className="text-muted-foreground">
                By: {String((order as { cancelledBy?: string }).cancelledBy)}
              </p>
            )}
            {(order as { cancellationReason?: string }).cancellationReason && (
              <p className="text-muted-foreground">
                Reason: {String((order as { cancellationReason?: string }).cancellationReason)}
              </p>
            )}
          </div>
        )}

        {st === 'OUT_FOR_DELIVERY' && !readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={patching}
              className="border-amber-500/40"
              onClick={() => onPatch('DELAYED')}
            >
              Report delay
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={patching}
              className="border-destructive/40 text-destructive"
              onClick={() => {
                if (!window.confirm('Mark delivery as failed?')) return;
                onPatch('FAILED');
              }}
            >
              Mark failed
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={patching}
              onClick={() => {
                if (!window.confirm('Cancel this delivery?')) return;
                onPatch('CANCELLED');
              }}
            >
              Cancel delivery
            </Button>
          </div>
        )}

        {isStoreDelivery && st === 'OUT_FOR_DELIVERY' && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Store delivery tracking</p>
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? 'Tracking link (if active). Branch staff start or manage live tracking.'
                : 'Create or restore a public tracking session, then share the link. The driver opens it in a browser so GPS updates flow to the customer.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {!readOnly && (
              <Button
                type="button"
                size="sm"
                className="btn-accent"
                disabled={ensureTrackMut.isPending || patching}
                onClick={() => ensureTrackMut.mutate()}
              >
                {ensureTrackMut.isPending ? 'Starting…' : 'Start delivery tracking'}
              </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!order.activeTrackingId}
                onClick={() => {
                  const url = buildPublicTrackingUrl(order.activeTrackingId!, order.activeTrackingToken);
                  void navigator.clipboard.writeText(url);
                  toast({ title: 'Copied', description: 'Tracking link copied to clipboard.' });
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy tracking link
              </Button>
              {!readOnly && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!order.activeTrackingId}
                  onClick={() => {
                    const url = buildPublicTrackingUrl(order.activeTrackingId!, order.activeTrackingToken);
                    const text = `Track this delivery (open in browser): ${url}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
                  }}
                >
                  WhatsApp
                </Button>
              )}
            </div>
            {!readOnly && (
            <div className="rounded-md border border-border bg-background/80 p-3 space-y-2 text-xs">
              <p className="font-medium text-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                Track driver
              </p>
              {pollFailed ? (
                <p className="text-amber-800 dark:text-amber-200">Unable to load latest coordinates.</p>
              ) : null}
              {isSocketReconnecting ? <p className="text-amber-800 dark:text-amber-200">Reconnecting…</p> : null}
              <p className="font-mono tabular-nums text-muted-foreground">
                {liveLat != null && liveLng != null
                  ? `${Number(liveLat).toFixed(5)}, ${Number(liveLng).toFixed(5)}`
                  : 'No live coordinates yet'}
              </p>
              <p className="text-muted-foreground">
                Last ping:{' '}
                {lastPingAtMs != null
                  ? new Date(lastPingAtMs).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
                  : '—'}
              </p>
              {order.activeTrackingId ? (
                <p className="break-all text-[11px] text-muted-foreground pt-2 border-t border-border">
                  {buildPublicTrackingUrl(order.activeTrackingId, order.activeTrackingToken)}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Tap “Start delivery tracking” if the customer does not see live movement.
                </p>
              )}
            </div>
            )}
            {readOnly && order.activeTrackingId && (
              <p className="break-all text-[11px] text-muted-foreground">
                {buildPublicTrackingUrl(order.activeTrackingId, order.activeTrackingToken)}
              </p>
            )}
          </div>
        )}

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</h4>
          <ul className="divide-y divide-border rounded-md border border-primary">
            {items.map((line, i) => {
              const rec = line as Record<string, unknown>;
              const qty = lineQty(rec);
              const unit = lineUnitPrice(rec);
              const sub = qty * unit;
              return (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {String(rec.name || 'Item')}
                    <span className="text-muted-foreground"> × {qty}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatCurrency(sub)}</span>
                  <span className="w-full text-xs text-muted-foreground sm:w-auto sm:text-right">
                    {formatCurrency(unit)} each
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-primary p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Customer</p>
            <p className="mt-1 font-medium">{order.customerName || '—'}</p>
            <p className="text-sm text-muted-foreground">{order.customerEmail || '—'}</p>
            {order.customerPhone && <p className="text-sm text-muted-foreground">{order.customerPhone}</p>}
            {(order as { customerAddress?: string }).customerAddress && (
              <p className="text-sm text-muted-foreground">
                Address: {String((order as { customerAddress?: string }).customerAddress)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-primary p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Totals</p>
            <p className="mt-1 text-sm">
              Order total: <span className="font-semibold">{formatCurrency(total)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Your share (93%): {formatCurrency(Number(order.supplierEarning ?? 0))} · Platform (7%):{' '}
              {formatCurrency(Number(order.platformCommission ?? 0))}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-primary p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Delivery / pickup</p>
          <p className="mt-2 text-sm">{formatDeliverySummary(order)}</p>
          {String(order.deliveryType || '').toUpperCase() === 'DELIVERY_PROVIDER' && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {order.deliveryProviderName ? (
                <>
                  <p>
                    Courier: <span className="text-foreground">{order.deliveryProviderName}</span>
                  </p>
                  {order.deliveryProviderPhone && (
                    <p>
                      Phone: <span className="text-foreground">{order.deliveryProviderPhone}</span>
                    </p>
                  )}
                  {order.deliveryProviderEmail && (
                    <p>
                      Email: <span className="text-foreground">{order.deliveryProviderEmail}</span>
                    </p>
                  )}
                </>
              ) : (
                <p>Courier not assigned yet</p>
              )}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity / updates</h4>
          <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-primary p-3 text-sm">
            {timeline.length === 0 ? (
              <li className="text-muted-foreground">No activity yet.</li>
            ) : (
              timeline.map((row) => (
                <li key={row.key} className="flex flex-col gap-0.5 border-b border-primary/30 pb-2 last:border-0 last:pb-0">
                  <span>{row.label}</span>
                  {row.at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
          {!readOnly && (
            <div className="mt-3 space-y-2">
              <Label htmlFor="supplier-order-note">Add an update</Label>
              <Textarea
                id="supplier-order-note"
                rows={2}
                placeholder="e.g. Order ready, delayed 10 min"
                value={noteDraft}
                onChange={(e) => onNoteChange(e.target.value)}
                className="resize-none"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={notePending || !noteDraft.trim()}
                onClick={onSubmitNote}
              >
                {notePending ? 'Sending…' : 'Post update'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
