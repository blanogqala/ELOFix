import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSupplierOrders,
  patchSupplierOrderFulfillment,
  postSupplierOrderNote,
  postSupplierEnsureTracking,
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
import { cn } from '@/lib/utils';
import { socket, ensureSocketAuthAndConnect } from '@/lib/socket';
import { useEffect, useMemo, useState } from 'react';
import { Search, ArrowLeft, Copy, MapPin } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import { useOrderLocationSocket } from '@/hooks/useOrderLocationSocket';

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

function displayStatus(st: string | undefined): string {
  const u = String(st || 'PENDING').toUpperCase();
  if (u === 'PREPARING') return 'In progress';
  return u.toLowerCase().replace(/_/g, ' ');
}

function nextFulfillmentStatus(
  s: string | undefined,
  deliveryType?: string
): MaterialFulfillmentStatus | null {
  const dt = String(deliveryType || '').toUpperCase();
  switch (String(s || 'PENDING').toUpperCase()) {
    case 'PENDING':
      return 'ACCEPTED';
    case 'ACCEPTED':
      return 'PREPARING';
    case 'PREPARING':
      return 'READY';
    case 'READY':
      if (dt === 'DELIVERY_PROVIDER') return null;
      return 'OUT_FOR_DELIVERY';
    case 'OUT_FOR_DELIVERY':
      return 'COMPLETED';
    default:
      return null;
  }
}

function actionButtonLabel(s: string | undefined, deliveryType?: string): string {
  const dt = String(deliveryType || '').toUpperCase();
  switch (String(s || 'PENDING').toUpperCase()) {
    case 'PENDING':
      return 'Accept order';
    case 'ACCEPTED':
      return 'Start preparing';
    case 'PREPARING':
      return 'Mark ready';
    case 'READY':
      if (dt === 'DELIVERY_PROVIDER') return 'Waiting for courier';
      return 'Start delivery';
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
      rows.push({
        key: `s-${e.createdAt}-${e.status}`,
        label: `Status → ${displayStatus(e.status)}`,
        at: e.createdAt,
      });
    } else if (e.type === 'note' && e.message) {
      rows.push({
        key: `n-${e.createdAt}-${e.message.slice(0, 24)}`,
        label: `Note: ${e.message}`,
        at: e.createdAt,
      });
    }
  }
  rows.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
  return rows;
}

export function SupplierOrders({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get('orderId') ?? '';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [noteDraft, setNoteDraft] = useState('');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['supplier', 'orders', userId],
    queryFn: () => getSupplierOrders(),
  });

  const selected = useMemo(() => {
    if (!orderIdFromUrl) return null;
    return orders.find((o) => o.id === orderIdFromUrl) ?? null;
  }, [orders, orderIdFromUrl]);

  useEffect(() => {
    if (!orderIdFromUrl || !orders.length) return;
    if (!orders.some((o) => o.id === orderIdFromUrl)) {
      setSearchParams({}, { replace: true });
    }
  }, [orders, orderIdFromUrl, setSearchParams]);

  useEffect(() => {
    if (!userId) return;
    ensureSocketAuthAndConnect();
    const onNew = () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'orders', userId] });
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

  const openOrder = (id: string) => {
    setSearchParams({ orderId: id });
  };

  const backToList = () => {
    setSearchParams({});
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading orders…</p>;
  }

  if (orders.length === 0) {
    return (
      <Card className="card-elevated border-dashed">
        <CardHeader>
          <CardTitle className="text-base">No orders yet</CardTitle>
          <CardDescription>New customer orders appear here in real time.</CardDescription>
        </CardHeader>
      </Card>
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
      {!selected && (
        <>
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
        />
      )}
    </div>
  );
}

function buildPublicTrackingUrl(trackingId: string, token?: string | null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${origin}/track/${encodeURIComponent(trackingId)}${q}`;
}

function DetailPanel({
  userId,
  order,
  onBack,
  onPatch,
  patching,
  noteDraft,
  onNoteChange,
  onSubmitNote,
  notePending,
}: {
  userId: string;
  order: SupplierMaterialOrderLine;
  onBack: () => void;
  onPatch: (s: MaterialFulfillmentStatus) => void;
  patching: boolean;
  noteDraft: string;
  onNoteChange: (v: string) => void;
  onSubmitNote: () => void;
  notePending: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const st = String(order.fulfillmentStatus || 'PENDING').toUpperCase();
  const next = nextFulfillmentStatus(st, order.deliveryType);
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.total ?? order.materialsSubtotal ?? 0);
  const src = String((order as { source?: string }).source || '');
  const jobId = (order as { jobId?: string }).jobId;
  const timeline = buildTimeline(order);
  const isStoreDelivery = String(order.deliveryType || '').toUpperCase() === 'STORE_DELIVERY';
  const trackSocketEnabled = st === 'OUT_FOR_DELIVERY' && isStoreDelivery;

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
  }, [st, order.deliveryType, order.activeTrackingId, order.activeTrackingToken]);

  return (
    <Card className="card-elevated overflow-hidden">
      <CardHeader className="border-b bg-background/80 py-4">
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
      <CardContent className="space-y-6 pt-6">
        {next && (
          <div>
            <Button
              type="button"
              className="btn-accent w-full sm:w-auto"
              disabled={patching || !next}
              onClick={() => next && onPatch(next)}
            >
              {actionButtonLabel(st, order.deliveryType)}
            </Button>
          </div>
        )}

        {st === 'OUT_FOR_DELIVERY' && (
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
              Create or restore a public tracking session, then share the link. The driver opens it in a browser so GPS
              updates flow to the customer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="btn-accent"
                disabled={ensureTrackMut.isPending || patching}
                onClick={() => ensureTrackMut.mutate()}
              >
                {ensureTrackMut.isPending ? 'Starting…' : 'Start delivery tracking'}
              </Button>
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
            </div>
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
          </div>
        )}

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</h4>
          <ul className="divide-y divide-border rounded-md border">
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
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Customer</p>
            <p className="mt-1 font-medium">{order.customerName || '—'}</p>
            <p className="text-sm text-muted-foreground">{order.customerEmail || '—'}</p>
            {order.customerPhone && <p className="text-sm text-muted-foreground">{order.customerPhone}</p>}
          </div>
          <div className="rounded-lg border border-border p-4">
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

        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Delivery / pickup</p>
          <p className="mt-2 text-sm">{formatDeliverySummary(order)}</p>
          {(order as { deliveryFee?: number }).deliveryFee != null && Number((order as { deliveryFee?: number }).deliveryFee) > 0 && (
            <p className="text-xs text-muted-foreground">
              Delivery fee: {formatCurrency(Number((order as { deliveryFee?: number }).deliveryFee))}
            </p>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity / updates</h4>
          <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3 text-sm">
            {timeline.length === 0 ? (
              <li className="text-muted-foreground">No activity yet.</li>
            ) : (
              timeline.map((row) => (
                <li key={row.key} className="flex flex-col gap-0.5 border-b border-border/60 pb-2 last:border-0 last:pb-0">
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
        </div>
      </CardContent>
    </Card>
  );
}
