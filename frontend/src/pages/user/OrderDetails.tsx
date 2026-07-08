import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MaterialOrderDetailSkeleton } from '@/components/common/loading';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { resolveEffectiveDeliveryFee, isStoreDeliveryAwaitingBranchQuote, isStoreDeliveryQuotedUnpaid } from '@/lib/orderFinance';
import { OrderDetailsView, NormalizedOrder, NormalizedDeliveryState } from '@/components/orders/OrderDetailsView';
import { DeliveryOptionChooser, DeliveryOptionSelection } from '@/components/orders/DeliveryOptionChooser';
import { getSuppliers } from '@/lib/api/suppliers';
import {
  getMaterialOrderById,
  updateMaterialOrderDelivery,
  confirmMaterialOrderCollection,
  cancelMaterialOrder,
  reportMaterialOrderDeliveryIssue,
} from '@/lib/api/materialOrders';
import {
  getJobsByUser,
  updateStoreOrderDelivery,
  setStoreDeliveryOption,
} from '@/lib/api/jobs';
import { getInvoiceById } from '@/lib/api/payments';
import { guardPaymentCardsForUser } from '@/lib/paymentCardGuard';
import { PaymentModal } from '@/components/payments/PaymentModal';
import { getDeliveryProviders } from '@/lib/api/specials';
import { DeliveryProvider, MaterialOrder, Supplier } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useOrderLocationSocket } from '@/hooks/useOrderLocationSocket';
import { useMaterialOrderFulfillmentSocket } from '@/hooks/useMaterialOrderFulfillmentSocket';
import { useStableMapCoords } from '@/hooks/useStableMapCoords';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatCurrency';
import { acceptMaterialOrderDeliveryQuote } from '@/lib/api/materialOrders';
import type { JobMaterialOrderSnapshot } from '@/types';
import { resolveMaterialBatchFromSnapshot } from '@/lib/materialBatchTracking';
import { toCanonicalDeliveryType } from '@/lib/deliveryTypes';
import { DeliveryExperienceFeedbackDialog } from '@/components/tracking/DeliveryExperienceFeedbackDialog';
import {
  DeliveryIssueReportDialog,
  type DeliveryIssueReason,
} from '@/components/orders/DeliveryIssueReportDialog';
import { queryKeys } from '@/lib/queryKeys';

type RouteParams = {
  orderId?: string;
  jobId?: string;
  storeOrderId?: string;
};

const CUSTOMER_CANCELABLE_FULFILLMENT_STATUSES = new Set([
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
]);

function toFulfillmentStatusU(status: string | undefined): string {
  const normalized = String(status || 'PENDING').toUpperCase().trim();
  return normalized || 'PENDING';
}

function applyEffectiveDeliveryFee(order: NormalizedOrder): NormalizedOrder {
  const fee = resolveEffectiveDeliveryFee(order);
  return fee > 0 ? { ...order, deliveryFee: fee } : { ...order, deliveryFee: 0 };
}

function resolveDeliveryFeeFromApi(input: {
  deliveryState: NormalizedDeliveryState;
  deliveryFee?: number;
  deliveryQuote?: { fee?: number };
  delivery?: { fee?: number };
}): number {
  const quoteFee = input.deliveryQuote?.fee;
  if (
    (input.deliveryState === 'Quoted' || input.deliveryState === 'Approved') &&
    quoteFee != null &&
    Number.isFinite(Number(quoteFee))
  ) {
    return Number(quoteFee);
  }
  const raw = Number(input.deliveryFee ?? input.delivery?.fee ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function resolveDeliveryRejectionReason(
  mo: MaterialOrder | Record<string, unknown> | null | undefined
): string | undefined {
  if (!mo || typeof mo !== 'object') return undefined;
  const rej = (mo as MaterialOrder).deliveryRejection;
  if (rej && typeof rej === 'object' && typeof rej.reason === 'string' && rej.reason.trim()) {
    return rej.reason.trim();
  }
  return undefined;
}

function mergeTrackingFields(
  normalized: NormalizedOrder,
  mo: Record<string, unknown> | null | undefined,
  options?: { destinationCoords?: { lat: number; lng: number } | null }
): NormalizedOrder {
  if (!mo) {
    if (options?.destinationCoords === undefined) return normalized;
    return {
      ...normalized,
      destinationCoords: options.destinationCoords ?? undefined,
    };
  }
  const snap: JobMaterialOrderSnapshot = {
    id: String(mo.id),
    supplierId: mo.storeId != null ? String(mo.storeId) : null,
    fulfillmentStatus: (mo.fulfillmentStatus as string) || 'PENDING',
    materialBatch: mo.materialBatch as JobMaterialOrderSnapshot['materialBatch'],
    paymentStatus: 'paid',
    total: Number(mo.total) || 0,
    materialsSubtotal: Number(mo.materialsSubtotal) || 0,
    platformCommission: Number(mo.platformCommission) || 0,
    supplierEarning: Number(mo.supplierEarning) || 0,
    items: [],
    createdAt: String(mo.createdAt || ''),
    supplierName: typeof mo.supplierDisplayName === 'string' ? mo.supplierDisplayName : undefined,
  };
  const batch = resolveMaterialBatchFromSnapshot(snap);
  const dl = mo.driverLocation as { lat?: unknown; lng?: unknown } | undefined;
  const dest =
    options?.destinationCoords !== undefined
      ? options.destinationCoords
      : normalized.destinationCoords;
  const fs = String(mo.fulfillmentStatus || '').toUpperCase();
  const trackingEligible = fs === 'OUT_FOR_DELIVERY';
  const activeTrackingId = trackingEligible && typeof mo.activeTrackingId === 'string' ? mo.activeTrackingId : undefined;
  const activeTrackingToken =
    trackingEligible && typeof mo.activeTrackingToken === 'string' ? mo.activeTrackingToken : undefined;
  return {
    ...normalized,
    fulfillmentStatus: String(mo.fulfillmentStatus || ''),
    materialBatch: batch,
    canonicalDelivery: toCanonicalDeliveryType(String(mo.deliveryType)),
    supplierDisplayName:
      typeof mo.supplierDisplayName === 'string' ? mo.supplierDisplayName : normalized.storeName,
    supplierPhone: typeof mo.supplierPhone === 'string' ? mo.supplierPhone : undefined,
    supplierAddress: typeof mo.supplierAddress === 'string' ? mo.supplierAddress : undefined,
    branchContactEmail: typeof mo.branchContactEmail === 'string' ? mo.branchContactEmail : undefined,
    branchCity: typeof mo.branchCity === 'string' ? mo.branchCity : undefined,
    branchArea: typeof mo.branchArea === 'string' ? mo.branchArea : undefined,
    branchHasDelivery: typeof mo.branchHasDelivery === 'boolean' ? mo.branchHasDelivery : undefined,
    branchDeliveryFee: typeof mo.branchDeliveryFee === 'number' && Number.isFinite(mo.branchDeliveryFee) ? mo.branchDeliveryFee : undefined,
    cancellationReason: typeof mo.cancellationReason === 'string' ? mo.cancellationReason : undefined,
    cancelledBy: typeof mo.cancelledBy === 'string' ? mo.cancelledBy : undefined,
    activeTrackingId,
    activeTrackingToken,
    materialOrderId: typeof mo.id === 'string' ? mo.id : normalized.materialOrderId,
    jobId: typeof mo.jobId === 'string' && mo.jobId.trim() ? mo.jobId : normalized.jobId,
    destinationCoords: dest ?? undefined,
    driverLocation:
      dl && Number.isFinite(Number(dl.lat)) && Number.isFinite(Number(dl.lng))
        ? { lat: Number(dl.lat), lng: Number(dl.lng), updatedAt: String((dl as { updatedAt?: string }).updatedAt || '') }
        : undefined,
    deliveryConfirmed: Boolean(mo.deliveryConfirmed),
    customerIssueFlag: Boolean(mo.customerIssueFlag),
    customerDeliveryIssue:
      mo.customerDeliveryIssue && typeof mo.customerDeliveryIssue === 'object'
        ? (mo.customerDeliveryIssue as NormalizedOrder['customerDeliveryIssue'])
        : undefined,
    customerRating:
      mo.customerRating && typeof mo.customerRating === 'object'
        ? (mo.customerRating as NormalizedOrder['customerRating'])
        : undefined,
  };
}

/** Fill store + courier contact from listings when API row is sparse */
function enrichOrderContact(
  order: NormalizedOrder,
  supplier: Supplier | undefined,
  provider: DeliveryProvider | null | undefined
): NormalizedOrder {
  const next = { ...order };
  if (supplier) {
    if (!next.supplierPhone && supplier.phone) next.supplierPhone = supplier.phone;
    if (!next.branchContactEmail && supplier.linkedUserEmail) {
      next.branchContactEmail = supplier.linkedUserEmail || undefined;
    }
    if (!next.supplierAddress && supplier.address) next.supplierAddress = supplier.address;
  }
  if (provider) {
    if (!next.providerName) next.providerName = provider.name;
    if (!next.providerPhone && provider.phone) next.providerPhone = provider.phone;
    if (!next.providerEmail && provider.email) next.providerEmail = provider.email;
  }
  return next;
}

export default function OrderDetails() {
  const { user } = useAuth();
  const { orderId, jobId, storeOrderId } = useParams<RouteParams>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateJobsAfterDeliveryChange = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    if (user?.id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.byUser(user.id) });
    }
    const parentJobId = order?.jobId || jobContext?.jobId;
    if (parentJobId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(parentJobId) });
    }
  };

  const [order, setOrder] = useState<NormalizedOrder | null>(null);
  const [jobContext, setJobContext] = useState<{ jobId: string; storeId: string } | null>(null);
  const [payDeliveryModalOpen, setPayDeliveryModalOpen] = useState(false);
  const [deliveryProviders, setDeliveryProviders] = useState<DeliveryProvider[]>([]);
  const [deliveryProvidersError, setDeliveryProvidersError] = useState<string | null>(null);
  const [deliveryChooserOpen, setDeliveryChooserOpen] = useState(false);
  const [deliveryChooserFromPickup, setDeliveryChooserFromPickup] = useState(false);
  const [storeHasDelivery, setStoreHasDelivery] = useState(false);
  const [storeDeliveryFee, setStoreDeliveryFee] = useState(0);
  const [receiptPending, setReceiptPending] = useState(false);
  const [deliveryFeedbackOpen, setDeliveryFeedbackOpen] = useState(false);
  const [deliveryJustCompleted, setDeliveryJustCompleted] = useState(false);
  const [issueReportOpen, setIssueReportOpen] = useState(false);
  const [issueReportPending, setIssueReportPending] = useState(false);
  const [highlightConfirmSection, setHighlightConfirmSection] = useState(
    () => searchParams.get('highlight') === 'confirm'
  );
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderLoadError, setOrderLoadError] = useState<string | null>(null);
  const loadOrderRef = useRef<(() => Promise<void>) | null>(null);

  const effectiveOrderId = orderId || storeOrderId;
  const trackingRoomOrderId = order?.materialOrderId || effectiveOrderId;
  const fulfillmentUForSocket = String(order?.fulfillmentStatus || '').toUpperCase();
  const customerLiveTrackingEnabled = Boolean(
    user &&
      trackingRoomOrderId &&
      order?.deliveryType !== 'SELF' &&
      fulfillmentUForSocket === 'OUT_FOR_DELIVERY' &&
      (order?.deliveryType !== 'STORE' || order?.deliveryPaid)
  );
  const { liveLat, liveLng, lastPingAtMs, pollFailed, isSocketReconnecting } = useOrderLocationSocket({
    orderId: trackingRoomOrderId,
    enabled: customerLiveTrackingEnabled,
  });
  const rawMapLat = liveLat ?? order?.driverLocation?.lat ?? null;
  const rawMapLng = liveLng ?? order?.driverLocation?.lng ?? null;
  const { lat: mapDisplayLat, lng: mapDisplayLng } = useStableMapCoords(rawMapLat, rawMapLng);
  const serverDriverPingMs = order?.driverLocation?.updatedAt
    ? new Date(order.driverLocation.updatedAt).getTime()
    : 0;
  const mergedLastDriverPingMs = (() => {
    const a = lastPingAtMs ?? 0;
    const b = serverDriverPingMs || 0;
    const m = Math.max(a, b);
    return m > 0 ? m : null;
  })();

  useMaterialOrderFulfillmentSocket({
    userId: user?.id,
    activeJobId: jobContext?.jobId,
    watchOrderId: effectiveOrderId,
    onWatchOrderFulfillment: () => {
      void loadOrderRef.current?.();
    },
  });

  useEffect(() => {
    if (!user) return;
    loadOrder();
    if (user) {
      getDeliveryProviders()
        .then((providers) => {
          setDeliveryProviders(providers);
          setDeliveryProvidersError(null);
        })
        .catch((error) => {
          setDeliveryProviders([]);
          setDeliveryProvidersError(
            error instanceof Error ? error.message : 'Delivery providers are unavailable.'
          );
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, orderId, storeOrderId, deliveryProviders.length]);

  useEffect(() => {
    if (searchParams.get('highlight') !== 'confirm') return;
    setHighlightConfirmSection(true);
    const t = window.setTimeout(() => {
      setHighlightConfirmSection(false);
      if (searchParams.get('highlight') === 'confirm') {
        const next = new URLSearchParams(searchParams);
        next.delete('highlight');
        setSearchParams(next, { replace: true });
      }
    }, 6000);
    return () => window.clearTimeout(t);
  }, [searchParams, setSearchParams]);

  const mapDeliveryStatus = (s: string): NormalizedOrder['deliveryStatus'] =>
    s === 'delivered' ? 'delivered' : s === 'out_for_delivery' ? 'out_for_delivery' : 'processing';

  const mapDeliveryState = (s: string): NormalizedDeliveryState =>
    (['SelfCollect', 'PendingApproval', 'Quoted', 'Approved', 'Rejected', 'Cancelled', 'InProgress', 'Processing', 'OnTheWay', 'Delivered'].includes(s)
      ? (s as NormalizedDeliveryState)
      : 'Processing');

  const resolveOrderDeliveryFields = (
    deliveryState: NormalizedDeliveryState,
    deliveryPaid: boolean,
    fulfillmentStatus?: string,
    courierJobId?: string | null
  ): { deliveryState: NormalizedDeliveryState; deliveryPaid: boolean } => {
    const fs = String(fulfillmentStatus || '').toUpperCase();
    let state = deliveryState;
    let paid = deliveryPaid;

    if (fs === 'COMPLETED') {
      state = 'Delivered';
      if (courierJobId) paid = true;
    } else if (
      courierJobId &&
      paid &&
      (fs === 'OUT_FOR_DELIVERY' || fs === 'READY') &&
      (state === 'Quoted' || state === 'Approved')
    ) {
      state = 'InProgress';
    }

    return { deliveryState: state, deliveryPaid: paid };
  };

  const addressFromMaterialOrder = (mo: MaterialOrder | null | undefined) => ({
    collectionAddress:
      mo?.collectionPoint?.address || mo?.materialBatch?.pickupAddress || undefined,
    destinationAddress:
      mo?.destinationPoint?.address || mo?.materialBatch?.deliveryAddress || mo?.customerAddress || undefined,
  });

  const loadOrder = async () => {
    if (!user) return;
    const effectiveOrderId = orderId || storeOrderId;
    if (!effectiveOrderId) {
      setOrderLoading(false);
      setOrderLoadError('Missing order id.');
      return;
    }

    setOrderLoading(true);
    setOrderLoadError(null);

    try {
      const found = await getMaterialOrderById(effectiveOrderId);
      const customerOwnsOrder =
        found &&
        (!found.userId || String(found.userId) === String(user.id));
      if (found && customerOwnsOrder) {
        const d = found.delivery;
        const p = found.payment;
        const rawDeliveryState = mapDeliveryState(d?.status ?? (found.deliveryType === 'SELF' ? 'SelfCollect' : 'PendingApproval'));
        const fulfillmentStatus = String(found.fulfillmentStatus || '');
        const courierJobId = found.courierJobId ?? null;
        const { deliveryState, deliveryPaid } = resolveOrderDeliveryFields(
          rawDeliveryState,
          p?.deliveryPaid ?? false,
          fulfillmentStatus,
          courierJobId
        );
        const deliveryFee = resolveDeliveryFeeFromApi({
          deliveryState,
          deliveryFee: found.deliveryFee,
          deliveryQuote: (found as MaterialOrder).deliveryQuote,
          delivery: found.delivery,
        });
        const addr = addressFromMaterialOrder(found);
        const provider = found.deliveryProviderId
          ? deliveryProviders.find(dp => dp.id === found.deliveryProviderId)
          : null;
        const normalized: NormalizedOrder = {
          id: found.id,
          storeName: found.storeName,
          storeId: found.storeId,
          items: (Array.isArray(found.items) ? found.items : []).map((i) => ({
            productId: i.productId,
            name: i.name,
            qty: i.qty,
            unitPrice: i.unitPrice,
          })),
          deliveryType: found.deliveryType === 'SELF' ? 'SELF' : found.deliveryType === 'STORE_DELIVERY' ? 'STORE' : 'PROVIDER',
          deliveryFee,
          totalPaid: found.total,
          createdAt: found.createdAt,
          deliveryStatus: mapDeliveryStatus(found.deliveryStatus),
          deliveryState,
          deliveryPaid,
          fulfillmentStatus,
          materialsPaid: p?.materialsPaid ?? true,
          invoiceId: found.invoiceId || `INV-${found.id.slice(-8)}`,
          deliveryInvoiceId: found.deliveryInvoiceId,
          providerName: provider?.name,
          providerPhone: provider?.phone,
          providerEmail: provider?.email,
          providerVehicle: provider ? [provider.vehicleType, provider.numberPlate].filter(Boolean).join(' - ') : undefined,
          jobId: found.jobId,
          courierJobId,
          finance: found.finance,
          materialsSubtotal: found.materialsSubtotal,
          platformCommission: found.platformCommission,
          supplierEarning: found.supplierEarning,
          deliveryRejectionReason: resolveDeliveryRejectionReason(found),
          deliveryQuote: (found as MaterialOrder).deliveryQuote,
          collectionAddress: addr.collectionAddress,
          destinationAddress: addr.destinationAddress,
          customerRating: (found as MaterialOrder).customerRating,
        };
        const suppliers = await getSuppliers();
        const supplier = suppliers.find(s => s.id === found.storeId);
        setOrder(
          applyEffectiveDeliveryFee(
            enrichOrderContact(
              mergeTrackingFields(normalized, found as unknown as Record<string, unknown>),
              supplier,
              provider ?? undefined
            )
          )
        );
        setJobContext(null);
        const f = found as MaterialOrder & {
          branchHasDelivery?: boolean;
          branchDeliveryFee?: number;
        };
        setStoreHasDelivery(
          typeof f.branchHasDelivery === 'boolean' ? f.branchHasDelivery : supplier?.hasDelivery ?? false
        );
        setStoreDeliveryFee(
          typeof f.branchDeliveryFee === 'number' && Number.isFinite(f.branchDeliveryFee)
            ? f.branchDeliveryFee
            : supplier?.deliveryFee ?? 0
        );
        setOrderLoading(false);
        return;
      }

      const jobs = await getJobsByUser(user.id);
      for (const job of jobs) {
        if (!job.storeOrders) continue;
        const storeOrder = job.storeOrders.find(so => so.orderId === effectiveOrderId);
        if (!storeOrder) continue;

        const d = storeOrder.delivery;
        const p = storeOrder.payment;
        const moRow = await getMaterialOrderById(effectiveOrderId);
        const rawMoDeliveryState = moRow?.delivery?.status
          ? mapDeliveryState(moRow.delivery.status)
          : mapDeliveryState(d?.status ?? storeOrder.deliveryStatus);
        const moFulfillment = String(moRow?.fulfillmentStatus || '');
        const courierJobId = moRow?.courierJobId ?? storeOrder.courierJobId ?? null;
        const moDeliveryPaid = moRow?.payment?.deliveryPaid ?? p?.deliveryPaid ?? false;
        const { deliveryState, deliveryPaid } = resolveOrderDeliveryFields(
          rawMoDeliveryState,
          moDeliveryPaid,
          moFulfillment,
          courierJobId
        );
        const deliveryFee = resolveDeliveryFeeFromApi({
          deliveryState,
          deliveryFee: moRow?.deliveryFee ?? storeOrder.deliveryFee,
          deliveryQuote: moRow?.deliveryQuote,
          delivery: moRow?.delivery ?? d,
        });
        const addr = addressFromMaterialOrder(moRow);
        const materialsTotal = storeOrder.items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
        const provider = storeOrder.deliveryProviderId
          ? deliveryProviders.find(dp => dp.id === storeOrder.deliveryProviderId)
          : null;
        const normalized: NormalizedOrder = {
          id: storeOrder.orderId,
          storeName: storeOrder.storeName || job.materials.find(m => m.supplierId === storeOrder.storeId)?.supplierName || 'Store',
          items: storeOrder.items.map(i => ({ productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
          deliveryType: storeOrder.deliveryType === 'STORE' ? 'STORE' : storeOrder.deliveryType,
          deliveryFee,
          totalPaid: materialsTotal + (p?.deliveryPaid ? (storeOrder.deliveryFee || 0) : 0),
          createdAt: storeOrder.createdAt,
          deliveryStatus:
            storeOrder.deliveryStatus === 'Delivered' ? 'delivered'
            : storeOrder.deliveryStatus === 'OnTheWay' || storeOrder.deliveryStatus === 'InProgress' ? 'out_for_delivery'
            : 'processing',
          deliveryState,
          deliveryPaid,
          materialsPaid: p?.materialsPaid ?? true,
          invoiceId: storeOrder.invoiceId,
          deliveryInvoiceId: storeOrder.deliveryInvoiceId,
          providerName: provider?.name,
          providerPhone: provider?.phone,
          providerEmail: provider?.email,
          providerVehicle: provider ? [provider.vehicleType, provider.numberPlate].filter(Boolean).join(' - ') : undefined,
          jobId: job.id,
          storeId: storeOrder.storeId,
          fulfillmentStatus: moFulfillment,
          courierJobId,
          finance: moRow?.finance,
          materialsSubtotal: moRow?.materialsSubtotal,
          platformCommission: moRow?.platformCommission,
          supplierEarning: moRow?.supplierEarning,
          deliveryRejectionReason: resolveDeliveryRejectionReason(moRow),
          deliveryQuote: moRow?.deliveryQuote,
          collectionAddress: addr.collectionAddress,
          destinationAddress: addr.destinationAddress || job.location?.address,
          customerRating: moRow?.customerRating,
        };
        const suppliers = await getSuppliers();
        const supplier = suppliers.find(s => s.id === storeOrder.storeId);
        setOrder(
          applyEffectiveDeliveryFee(
            enrichOrderContact(
              mergeTrackingFields(normalized, moRow as unknown as Record<string, unknown>, {
                destinationCoords: job.location?.coordinates ?? null,
              }),
              supplier,
              provider ?? undefined
            )
          )
        );
        setJobContext({ jobId: job.id, storeId: storeOrder.storeId });
        const m = moRow as MaterialOrder | null;
        setStoreHasDelivery(
          m && typeof m.branchHasDelivery === 'boolean' ? m.branchHasDelivery : supplier?.hasDelivery ?? false
        );
        setStoreDeliveryFee(
          m && typeof m.branchDeliveryFee === 'number' && Number.isFinite(m.branchDeliveryFee)
            ? m.branchDeliveryFee
            : supplier?.deliveryFee ?? 0
        );
        setOrderLoading(false);
        return;
      }

      setOrder(null);
      setOrderLoadError('We could not find this order. It may have been removed or you may not have access.');
    } catch (e) {
      setOrder(null);
      setOrderLoadError(
        e instanceof Error ? e.message : 'Failed to load order details. Please try again.'
      );
    } finally {
      setOrderLoading(false);
    }
  };
  loadOrderRef.current = loadOrder;

  const isStandalone = !jobContext;
  const orderFulfillmentStatusU = toFulfillmentStatusU(order?.fulfillmentStatus);
  const canCustomerCancelOrder = CUSTOMER_CANCELABLE_FULFILLMENT_STATUSES.has(orderFulfillmentStatusU);

  const handleCancelDelivery = async () => {
    if (!order || !effectiveOrderId) return;
    const isApprovedUnpaid = order.deliveryState === 'Approved' && !order.deliveryPaid;
    if (isApprovedUnpaid && !window.confirm('Cancel delivery? You will need to choose a new delivery option.')) return;
    try {
      if (jobContext) {
        await updateStoreOrderDelivery(jobContext.jobId, jobContext.storeId, { status: 'Cancelled' });
      } else {
        await updateMaterialOrderDelivery(effectiveOrderId, { status: 'Cancelled' });
      }
      toast({ title: 'Delivery cancelled', description: 'Delivery cancelled. You can choose a new delivery option.' });
      loadOrder();
      invalidateJobsAfterDeliveryChange();
    } catch {
      toast({ title: 'Error', description: 'Failed to cancel delivery.', variant: 'destructive' });
    }
  };

  const handleAcceptQuote = async () => {
    if (!order || !effectiveOrderId) return;
    try {
      await acceptMaterialOrderDeliveryQuote(effectiveOrderId);
      toast({ title: 'Quote accepted', description: 'You can now pay for delivery.' });
      loadOrder();
    } catch {
      toast({ title: 'Error', description: 'Failed to accept quote.', variant: 'destructive' });
    }
  };

  const handleCancelOrder = async () => {
    if (!order || !effectiveOrderId) return;
    const statusU = toFulfillmentStatusU(order.fulfillmentStatus);
    if (!CUSTOMER_CANCELABLE_FULFILLMENT_STATUSES.has(statusU)) return;
    if (!window.confirm('Cancel this order?')) return;
    const reason = window.prompt('Optional cancellation reason:') || '';
    try {
      const out = await cancelMaterialOrder(effectiveOrderId, reason.trim() || undefined);
      toast({
        title: 'Order cancelled',
        description: `Refund recorded: ${formatCurrency(Number(out.refund?.amount || 0), { decimals: 2 })}`,
      });
      await loadOrder();
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to cancel order.',
        variant: 'destructive',
      });
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'partially_refunded': return 'Partially Refunded';
      case 'refunded': return 'Refunded';
      default: return 'Paid';
    }
  };

  const handleViewInvoice = async (invoiceId: string) => {
    if (!user) return;
    const invoice = await getInvoiceById(user.id, invoiceId);
    if (!invoice) {
      toast({ title: 'Invoice not found', variant: 'destructive' });
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.id}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { color: #0A2540; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; }
          .total { font-weight: bold; font-size: 1.2em; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
          .paid { background: #d4edda; color: #155724; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>EloFix Invoice</h1>
            <p>Invoice ID: ${invoice.id}</p>
            <p>Reference: ${invoice.jobId}</p>
            ${invoice.driverName ? `<p>Driver: ${invoice.driverName}</p>` : ''}
            ${invoice.vehicleInfo ? `<p>Vehicle: ${invoice.vehicleInfo}</p>` : ''}
          </div>
          <div style="text-align: right;">
            <p>Date: ${format(parseISO(invoice.paidAt), 'PPP')}</p>
            <span class="status paid">${getStatusLabel(invoice.status)}</span>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.lineItems.map(item => `
              <tr>
                <td>${item.description}${item.supplierName ? ` (${item.supplierName})` : ''}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unitPrice, { decimals: 2 })}</td>
                <td>${formatCurrency(item.total, { decimals: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="total">
              <td colspan="3">Total</td>
              <td>${formatCurrency(invoice.totalAmount, { decimals: 2 })}</td>
            </tr>
          </tfoot>
        </table>
        <p><strong>Payment Method:</strong> ${invoice.paymentMethod}${invoice.cardLast4 ? ` ending in ${invoice.cardLast4}` : ''}</p>
        <script>window.print();</script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePayDelivery = async () => {
    if (!order || !effectiveOrderId || !user) return;
    const canPay = await guardPaymentCardsForUser(user.id, toast);
    if (!canPay) return;
    const fee = resolveEffectiveDeliveryFee({
      deliveryFee: order.deliveryFee,
      deliveryType:
        order.deliveryType === 'STORE'
          ? 'STORE_DELIVERY'
          : order.deliveryType === 'PROVIDER'
            ? 'DELIVERY_PROVIDER'
            : 'SELF',
      delivery: { fee: order.deliveryFee, status: order.deliveryState },
      deliveryPaid: order.deliveryPaid,
      deliveryState: order.deliveryState,
    });
    if (fee <= 0) return;
    setPayDeliveryModalOpen(true);
  };

  const handleChangeDelivery = () => {
    const isApprovedUnpaid = order?.deliveryState === 'Approved' && !order?.deliveryPaid;
    if (isApprovedUnpaid && !window.confirm('Change delivery option? Your current approval will be lost.')) return;
    setDeliveryChooserFromPickup(false);
    setDeliveryChooserOpen(true);
  };

  const handleChangeFromPickup = () => {
    setDeliveryChooserFromPickup(true);
    setDeliveryChooserOpen(true);
  };

  const handleChooseDelivery = () => {
    setDeliveryChooserFromPickup(false);
    setDeliveryChooserOpen(true);
  };

  const handleDeliveryOptionSelected = async (delivery: DeliveryOptionSelection) => {
    if (!order || !effectiveOrderId) return;
    try {
      if (jobContext) {
        await setStoreDeliveryOption(jobContext.jobId, jobContext.storeId, {
          deliveryType: delivery.type,
          deliveryFee: delivery.fee,
          deliveryProviderId: delivery.providerId,
          orderId: effectiveOrderId,
        });
      } else {
        const updates = {
          type: delivery.type,
          status: delivery.status as 'SelfCollect' | 'PendingApproval',
          fee: delivery.fee,
          providerId: delivery.providerId,
        };
        await updateMaterialOrderDelivery(effectiveOrderId, updates);
      }
      toast({ title: 'Delivery option updated', description: 'Your delivery preference has been saved.' });
      setDeliveryChooserOpen(false);
      loadOrder();
      invalidateJobsAfterDeliveryChange();
    } catch {
      toast({ title: 'Error', description: 'Failed to update delivery option.', variant: 'destructive' });
    }
  };

  const handleConfirmReceipt = async () => {
    if (!effectiveOrderId || !order) return;
    const isPickup = order.deliveryType === 'SELF' || order.canonicalDelivery === 'pickup';
    setReceiptPending(true);
    try {
      await confirmMaterialOrderCollection(effectiveOrderId);
      toast({
        title: isPickup ? 'Collection confirmed' : 'Delivery completed successfully',
        description: isPickup
          ? 'Your pickup has been confirmed.'
          : 'Thanks — share quick feedback below if you have a moment.',
      });
      setDeliveryJustCompleted(!isPickup);
      await loadOrder();
      if (!isPickup) {
        try {
          const fresh = await getMaterialOrderById(effectiveOrderId);
          if (!(fresh as MaterialOrder | null)?.customerRating) {
            setDeliveryFeedbackOpen(true);
          }
        } catch {
          setDeliveryFeedbackOpen(true);
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Could not confirm.', variant: 'destructive' });
    } finally {
      setReceiptPending(false);
    }
  };

  const handleReportDeliveryIssue = async (reason: DeliveryIssueReason, details?: string) => {
    if (!effectiveOrderId) return;
    setIssueReportPending(true);
    try {
      await reportMaterialOrderDeliveryIssue(effectiveOrderId, { reason, details });
      setIssueReportOpen(false);
      toast({
        title: 'Issue reported',
        description: 'The branch has been notified and will follow up with you.',
      });
      await loadOrder();
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: 'Could not report issue',
        description: message || 'Please try again.',
        variant: 'destructive',
      });
      throw err;
    } finally {
      setIssueReportPending(false);
    }
  };

  const handleBack = () => {
    if (location.pathname.startsWith('/user/material-orders/')) {
      navigate('/user/material-orders');
      return;
    }
    if (location.key !== 'default') {
      navigate(-1);
    } else if (isStandalone) {
      navigate('/user/material-orders');
    } else if (jobContext?.jobId) {
      navigate(`/user/jobs/${jobContext.jobId}`);
    } else {
      navigate('/user/dashboard');
    }
  };

  const isCourierLinked =
    order?.deliveryType === 'PROVIDER' &&
    Boolean(order?.courierJobId) &&
    !order?.deliveryPaid;

  const hasDeliveryAlternatives = storeHasDelivery || deliveryProviders.length > 0;
  const canChangeFromPickup =
    Boolean(order) &&
    order.deliveryType === 'SELF' &&
    CUSTOMER_CANCELABLE_FULFILLMENT_STATUSES.has(orderFulfillmentStatusU) &&
    hasDeliveryAlternatives;

  const dispatchLocked = ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'].includes(orderFulfillmentStatusU);
  const deliveryInTransit = ['InProgress', 'OnTheWay', 'Delivered'].includes(order?.deliveryState || '');
  const canChangeDeliveryOption =
    Boolean(order) &&
    !dispatchLocked &&
    !deliveryInTransit &&
    (isStoreDeliveryAwaitingBranchQuote({
      deliveryType: order.deliveryType === 'STORE' ? 'STORE_DELIVERY' : order.deliveryType,
      deliveryState: order.deliveryState,
      deliveryFee: order.deliveryFee,
      deliveryQuote: order.deliveryQuote,
      deliveryPaid: order.deliveryPaid,
    }) ||
      order.deliveryState === 'PendingApproval' ||
      order.deliveryState === 'Rejected' ||
      order.deliveryState === 'Quoted' ||
      (order.deliveryState === 'Approved' && !order.deliveryPaid) ||
      isStoreDeliveryQuotedUnpaid({
        deliveryType: order.deliveryType === 'STORE' ? 'STORE_DELIVERY' : order.deliveryType,
        deliveryState: order.deliveryState,
        deliveryFee: order.deliveryFee,
        deliveryQuote: order.deliveryQuote,
        deliveryPaid: order.deliveryPaid,
      }) ||
      (order.deliveryState === 'Processing' && !order.deliveryPaid && order.deliveryType === 'STORE'));

  const payDeliveryAmount = order
    ? resolveEffectiveDeliveryFee({
        deliveryFee: order.deliveryFee,
        deliveryType:
          order.deliveryType === 'STORE'
            ? 'STORE_DELIVERY'
            : order.deliveryType === 'PROVIDER'
              ? 'DELIVERY_PROVIDER'
              : 'SELF',
        delivery: { fee: order.deliveryFee, status: order.deliveryState },
        deliveryQuote: order.deliveryQuote,
        deliveryPaid: order.deliveryPaid,
        deliveryState: order.deliveryState,
      })
    : 0;

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl space-y-6 md:space-y-8 animate-fade-in">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Order Details</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Track your material delivery in real-time.
            </p>
          </div>
        </div>

        {orderLoading ? (
          <MaterialOrderDetailSkeleton />
        ) : orderLoadError && !order ? (
          <div className="card-elevated p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{orderLoadError}</p>
            <Button variant="outline" size="sm" onClick={() => void loadOrder()}>
              Try again
            </Button>
          </div>
        ) : order ? (
          <>
            <OrderDetailsView
              order={order}
              liveDriverLat={liveLat}
              liveDriverLng={liveLng}
              mapDisplayLat={mapDisplayLat}
              mapDisplayLng={mapDisplayLng}
              lastDriverPingMs={mergedLastDriverPingMs}
              locationPollFailed={pollFailed}
              socketReconnecting={isSocketReconnecting}
              highlightDeliveryComplete={deliveryJustCompleted}
              highlightConfirmSection={highlightConfirmSection}
              onDismissDeliveryHighlight={() => setDeliveryJustCompleted(false)}
              onCancelDelivery={
                order.deliveryState === 'PendingApproval' || (order.deliveryState === 'Approved' && !order.deliveryPaid)
                  ? handleCancelDelivery
                  : undefined
              }
              onChangeDelivery={
                canChangeDeliveryOption
                  ? handleChangeDelivery
                  : canChangeFromPickup
                    ? handleChangeFromPickup
                    : undefined
              }
              onChooseDelivery={handleChooseDelivery}
              onCancelOrder={canCustomerCancelOrder ? handleCancelOrder : undefined}
              onPayDelivery={
                !isCourierLinked &&
                !order.deliveryPaid &&
                payDeliveryAmount > 0 &&
                (order.deliveryState === 'Approved' ||
                  isStoreDeliveryQuotedUnpaid({
                    deliveryType: order.deliveryType === 'STORE' ? 'STORE_DELIVERY' : order.deliveryType,
                    deliveryState: order.deliveryState,
                    deliveryFee: order.deliveryFee,
                    deliveryQuote: order.deliveryQuote,
                    deliveryPaid: order.deliveryPaid,
                  }))
                  ? handlePayDelivery
                  : undefined
              }
              onAcceptQuote={
                !isCourierLinked &&
                order.deliveryState === 'Quoted' &&
                !order.deliveryPaid &&
                String(order.fulfillmentStatus || '').toUpperCase() !== 'COMPLETED'
                  ? handleAcceptQuote
                  : undefined
              }
              onGoToDeliveryJob={
                isCourierLinked && order.courierJobId
                  ? () => navigate(`/user/jobs/${order.courierJobId}`)
                  : undefined
              }
              onViewDeliveryJob={
                order.deliveryType === 'PROVIDER' &&
                order.courierJobId &&
                (order.deliveryPaid ||
                  String(order.fulfillmentStatus || '').toUpperCase() === 'COMPLETED' ||
                  order.deliveryState === 'Delivered')
                  ? () => navigate(`/user/jobs/${order.courierJobId}`)
                  : undefined
              }
              onViewMaterialInvoice={user ? handleViewInvoice : undefined}
              onViewDeliveryInvoice={user ? handleViewInvoice : undefined}
              onConfirmReceipt={handleConfirmReceipt}
              confirmReceiptPending={receiptPending}
              onReportDeliveryIssue={() => setIssueReportOpen(true)}
              reportIssuePending={issueReportPending}
            />
            <DeliveryIssueReportDialog
              open={issueReportOpen}
              onOpenChange={setIssueReportOpen}
              pending={issueReportPending}
              onSubmit={handleReportDeliveryIssue}
            />
            <DeliveryOptionChooser
              open={deliveryChooserOpen}
              onOpenChange={(open) => {
                setDeliveryChooserOpen(open);
                if (!open) setDeliveryChooserFromPickup(false);
              }}
              storeName={order.storeName}
              storeId={order.storeId || ''}
              storeHasDelivery={storeHasDelivery}
              storeDeliveryFee={storeDeliveryFee}
              deliveryProviders={deliveryProviders}
              deliveryProvidersError={deliveryProvidersError}
              hideSelfOption={deliveryChooserFromPickup}
              onSelect={handleDeliveryOptionSelected}
            />
            {!isCourierLinked && payDeliveryAmount > 0 ? (
            <PaymentModal
              open={payDeliveryModalOpen}
              onOpenChange={setPayDeliveryModalOpen}
              title="Pay delivery fee"
              description={
                order.deliveryType === 'STORE'
                  ? 'Complete payment so the store can dispatch your materials.'
                  : 'Complete payment so your courier can collect and deliver your materials.'
              }
              amount={payDeliveryAmount}
              kind="DELIVERY_FEE"
              jobId={jobContext?.jobId || order.jobId}
              materialOrderId={order.materialOrderId || effectiveOrderId}
              metadata={
                jobContext
                  ? {
                      storeId: jobContext.storeId,
                      orderId: effectiveOrderId,
                    }
                  : undefined
              }
              breakdown={[
                { label: 'Delivery fee', amount: payDeliveryAmount },
                { label: 'Total due', amount: payDeliveryAmount, isBold: true },
              ]}
            />
            ) : null}
            {order.deliveryType !== 'SELF' && order.canonicalDelivery !== 'pickup' ? (
            <DeliveryExperienceFeedbackDialog
              open={deliveryFeedbackOpen}
              onOpenChange={setDeliveryFeedbackOpen}
              merchantLabel={
                order.deliveryType === 'PROVIDER'
                  ? order.providerName || 'your courier'
                  : order.supplierDisplayName || order.storeName || 'the store'
              }
              materialOrderId={order.materialOrderId || effectiveOrderId || null}
              canSubmit={
                Boolean(order.jobId) &&
                String(order.fulfillmentStatus || '').toUpperCase() === 'COMPLETED' &&
                order.deliveryConfirmed === true &&
                !order.customerRating
              }
              existingRating={order.customerRating ?? null}
              onRated={() => {
                void loadOrder();
                void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
                void queryClient.invalidateQueries({ queryKey: ['delivery-request-by-job'] });
                if (jobContext?.jobId) {
                  void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobContext.jobId) });
                }
              }}
            />
            ) : null}
          </>
        ) : (
          <div className="card-elevated p-6 text-center text-sm text-muted-foreground sm:p-8 sm:text-base">
            Order not found.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

