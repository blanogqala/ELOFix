import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCourierDeliveryInbox } from '@/lib/api/deliveryInbox';
import { getCourierDirectDeliveryInbox } from '@/lib/api/deliveryRequests';
import { MaterialOrder, DeliveryRequestRecord } from '@/types';
import { formatCurrency } from '@/lib/formatCurrency';
import { Truck, MapPin, Package, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function deliveryState(order: MaterialOrder): string {
  return String(order.delivery?.status || 'PendingApproval');
}

function tabForOrder(order: MaterialOrder): 'pending' | 'active' | 'completed' {
  const ds = deliveryState(order);
  const fs = String(order.fulfillmentStatus || 'PENDING').toUpperCase();
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(fs) || ds === 'Rejected') return 'completed';
  if (['Approved', 'Processing', 'InProgress', 'OnTheWay'].includes(ds) || ['OUT_FOR_DELIVERY', 'DELAYED', 'READY'].includes(fs)) {
    return 'active';
  }
  return 'pending';
}

function statusBadge(order: MaterialOrder) {
  const ds = deliveryState(order);
  const fs = String(order.fulfillmentStatus || 'PENDING').toUpperCase();
  if (ds === 'PendingApproval') return { label: 'Awaiting your quote', className: 'bg-warning/20 text-warning' };
  if (ds === 'Quoted') return { label: 'Quote sent', className: 'bg-primary/15 text-primary' };
  if (ds === 'Approved' && !order.payment?.deliveryPaid) return { label: 'Awaiting customer payment', className: 'bg-amber-500/15 text-amber-800 dark:text-amber-100' };
  if (fs === 'OUT_FOR_DELIVERY') return { label: 'In transit', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-200' };
  if (fs === 'COMPLETED') return { label: 'Completed', className: 'bg-success/20 text-success' };
  if (ds === 'Rejected') return { label: 'Declined', className: 'bg-muted text-muted-foreground' };
  return { label: ds, className: 'bg-secondary text-secondary-foreground' };
}

function DeliveryCard({ order, onClick }: { order: MaterialOrder; onClick: () => void }) {
  const badge = statusBadge(order);
  const collection = order.collectionPoint?.address || order.materialBatch?.pickupAddress || 'Collection TBC';
  const destination = order.destinationPoint?.address || order.materialBatch?.deliveryAddress || order.customerAddress || 'Destination TBC';
  const itemCount = (order.items || []).reduce((s, i) => s + Number(i.qty || 0), 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className="card-elevated w-full text-left p-4 sm:p-5 transition-shadow hover:shadow-lg border border-border/80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline" className={cn('text-xs', badge.className)}>
              {badge.label}
            </Badge>
            {order.jobId ? (
              <Badge variant="secondary" className="text-xs">
                Job materials
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Material order
              </Badge>
            )}
          </div>
          <p className="font-semibold truncate">{order.storeName || 'Delivery run'}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Package className="h-3 w-3 shrink-0" />
            {itemCount} item{itemCount === 1 ? '' : 's'}
            {order.deliveryQuote?.fee != null ? ` · Quote ${formatCurrency(order.deliveryQuote.fee)}` : ''}
          </p>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p className="flex items-start gap-1.5">
              <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
              <span>
                <span className="font-medium text-foreground">Collect:</span> {collection}
              </span>
            </p>
            <p className="flex items-start gap-1.5">
              <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-accent" />
              <span>
                <span className="font-medium text-foreground">Deliver:</span> {destination}
              </span>
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
    </button>
  );
}

export default function ProviderDeliveryInbox() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'pending' | 'active' | 'completed'>('pending');

  const { data: materialOrders = [], isLoading: loadingMaterials, refetch: refetchMaterials } = useQuery({
    queryKey: ['courier', 'delivery-inbox'],
    queryFn: getCourierDeliveryInbox,
  });

  const { data: directRequests = [], isLoading: loadingDirect, refetch: refetchDirect } = useQuery({
    queryKey: ['courier', 'direct-delivery-inbox'],
    queryFn: getCourierDirectDeliveryInbox,
  });

  const isLoading = loadingMaterials || loadingDirect;

  const refetch = useCallback(() => {
    void refetchMaterials();
    void refetchDirect();
  }, [refetchMaterials, refetchDirect]);

  useEffect(() => {
    const id = window.setInterval(() => void refetch(), 30000);
    return () => window.clearInterval(id);
  }, [refetch]);

  const grouped = useMemo(() => {
    const pending: Array<{ kind: 'material'; order: MaterialOrder } | { kind: 'direct'; request: DeliveryRequestRecord }> = [];
    const active: typeof pending = [];
    const completed: typeof pending = [];

    const pushMaterial = (order: MaterialOrder) => {
      const t = tabForOrder(order);
      const entry = { kind: 'material' as const, order };
      if (t === 'pending') pending.push(entry);
      else if (t === 'active') active.push(entry);
      else completed.push(entry);
    };

    for (const o of materialOrders) pushMaterial(o);

    const directTab = (r: DeliveryRequestRecord) => {
      const s = String(r.status);
      const fs = String(r.fulfillmentStatus || '').toUpperCase();
      if (['completed', 'rejected', 'cancelled'].includes(s) || fs === 'COMPLETED') return 'completed';
      if (['paid', 'in_transit', 'approved'].includes(s) || ['OUT_FOR_DELIVERY', 'READY'].includes(fs)) return 'active';
      return 'pending';
    };

    for (const r of directRequests) {
      const t = directTab(r);
      const entry = { kind: 'direct' as const, request: r };
      if (t === 'pending') pending.push(entry);
      else if (t === 'active') active.push(entry);
      else completed.push(entry);
    }

    return { pending, active, completed };
  }, [materialOrders, directRequests]);

  const list = grouped[tab];

  const openEntry = useCallback(
    (entry: (typeof grouped.pending)[number]) => {
      if (entry.kind === 'material') navigate(`/provider/deliveries/${entry.order.id}`);
      else navigate(`/provider/direct-deliveries/${entry.request.id}`);
    },
    [navigate]
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl animate-fade-in py-6 sm:py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Truck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Deliveries</h1>
            <p className="text-sm text-muted-foreground">Courier jobs assigned to you</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="pending">Pending ({grouped.pending.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({grouped.active.length})</TabsTrigger>
            <TabsTrigger value="completed">Done ({grouped.completed.length})</TabsTrigger>
          </TabsList>

          {(['pending', 'active', 'completed'] as const).map((key) => (
            <TabsContent key={key} value={key} className="space-y-3 mt-0">
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading deliveries…</p>
              ) : grouped[key].length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No deliveries in this tab.</p>
              ) : (
                grouped[key].map((entry) =>
                  entry.kind === 'material' ? (
                    <DeliveryCard
                      key={`m-${entry.order.id}`}
                      order={entry.order}
                      onClick={() => openEntry(entry)}
                    />
                  ) : (
                    <button
                      key={`d-${entry.request.id}`}
                      type="button"
                      onClick={() => openEntry(entry)}
                      className="card-elevated w-full text-left p-4 sm:p-5 border border-border/80"
                    >
                      <p className="font-semibold">Direct delivery</p>
                      <p className="text-xs text-muted-foreground mt-1 capitalize">{entry.request.status.replace(/_/g, ' ')}</p>
                      <p className="text-xs mt-2">{entry.request.collectionPoint?.address} → {entry.request.destinationPoint?.address}</p>
                    </button>
                  )
                )
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
