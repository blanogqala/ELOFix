import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Job, MaterialLine, SavedCard, Supplier, JobStoreOrder, UserMaterialSuggestion, DeliveryProvider } from '@/types';
import { MaterialCard } from '@/components/materials/MaterialCard';
import { 
  CreditCard, 
  Truck, 
  Package, 
  CheckCircle,
  Plus,
  Trash2,
  AlertCircle,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { UnifiedTrackingSection } from '@/components/tracking/UnifiedTrackingSection';
import {
  fulfillmentStatusBadgeLabel,
  resolveMaterialBatchFromSnapshot,
} from '@/lib/materialBatchTracking';
import { resolveMaterialOrderForStoreOrder } from '@/lib/providerMaterialOrderHelpers';

interface MaterialPaymentSectionProps {
  job: Job;
  userSuggestions?: UserMaterialSuggestion[];
  savedCards: SavedCard[];
  deliveryProviders: DeliveryProvider[];
  deliveryProvidersError?: string | null;
  onPayForStore: (
    supplierId: string, 
    cardId: string, 
    cardLast4: string,
    options?: {
      deliveryType: 'SELF' | 'STORE' | 'PROVIDER';
      deliveryFee: number;
      deliveryProviderId?: string;
      orderId?: string;
    }
  ) => Promise<void>;
  onAddMaterials?: () => void;
  onDeleteMaterial?: (material: MaterialLine) => void;
  onSuggestAlternatives?: () => void;
  suppliers: Supplier[];
  onSelectDeliveryOption: (
    storeId: string,
    params: {
      deliveryType: 'SELF' | 'STORE' | 'PROVIDER';
      deliveryFee: number;
      deliveryProviderId?: string;
      orderId?: string;
    }
  ) => Promise<void>;
  onSimulateProviderApproval: (storeId: string) => Promise<void>;
  onViewStoreOrder: (orderId: string) => void;
}

/** Canonical storefront key: branch id when present (job materials / migrated JSON). */
function lineStoreKey(m: MaterialLine): string {
  return String(m.branchId ?? m.supplierId);
}

function uniqueMaterialLines(materials: MaterialLine[]): MaterialLine[] {
  return Array.from(
    new Map(
      materials.map((m) => {
        const id = (m as { id?: string }).id;
        const store = lineStoreKey(m);
        const key =
          id && String(id).trim() !== ''
            ? String(id)
            : `${store}|${m.productId}|${m.materialRequestId ?? ''}|${m.name}`;
        return [key, m];
      })
    ).values()
  );
}

function lineFromOrderItem(storeId: string, storeName: string, item: JobStoreOrder['items'][number]): MaterialLine {
  return {
    branchId: storeId,
    supplierId: storeId,
    supplierName: storeName,
    productId: item.productId,
    name: item.name,
    qty: item.qty,
    unitPrice: item.unitPrice,
    qualityTier: item.qualityTier,
    unit: 'unit',
    imageUrl: item.imageUrl,
  };
}

export function MaterialPaymentSection({
  job,
  userSuggestions = [],
  savedCards,
  deliveryProviders,
  deliveryProvidersError,
  onPayForStore,
  onAddMaterials,
  onDeleteMaterial,
  onSuggestAlternatives,
  suppliers,
  onSelectDeliveryOption,
  onSimulateProviderApproval,
  onViewStoreOrder,
}: MaterialPaymentSectionProps) {
  const defaultCard = savedCards.find(c => c.isDefault) || savedCards[0];
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<{
    orderId?: string;
    id: string;
    name: string;
    hasDelivery: boolean;
    deliveryFee?: number;
    materials: MaterialLine[];
  } | null>(null);
  const [selectedCardId, setSelectedCardId] = useState(defaultCard?.id || '');
  const [selectedDeliveryId, setSelectedDeliveryId] = useState('');
  const [cvc, setCvc] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryStoreId, setDeliveryStoreId] = useState<string | null>(null);
  const [selectedDeliveryType, setSelectedDeliveryType] = useState<'SELF' | 'STORE' | 'PROVIDER'>('SELF');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [purchaseFlowOpen, setPurchaseFlowOpen] = useState(false);
  const [purchaseFlowStep, setPurchaseFlowStep] = useState<1 | 2>(1);
  const [userMaterialTab, setUserMaterialTab] = useState<'pending' | 'suggested'>('pending');
  const [purchaseFlowStore, setPurchaseFlowStore] = useState<{
    orderId?: string;
    id: string;
    name: string;
    hasDelivery: boolean;
    deliveryFee?: number;
    materials: MaterialLine[];
  } | null>(null);

  const hasCourierOption = deliveryProviders.length > 0;

  useEffect(() => {
    if (!hasCourierOption) {
      setSelectedDeliveryType(prev => (prev === 'PROVIDER' ? 'SELF' : prev));
      setSelectedProviderId('');
    }
  }, [hasCourierOption]);

  // Group materials by store (deduped lines so pending / paid views do not double-list)
  const materials = uniqueMaterialLines(job.materials || []);
  const materialsByStore = materials.reduce((acc, m) => {
    const sid = lineStoreKey(m);
    if (!acc[sid]) {
      acc[sid] = {
        id: sid,
        name: m.supplierName,
        materials: [],
        total: 0,
      };
    }
    acc[sid].materials.push(m);
    acc[sid].total += m.qty * m.unitPrice;
    return acc;
  }, {} as Record<string, { id: string; name: string; materials: MaterialLine[]; total: number }>);

  // Check payment status from job.materialPayments
  const getStorePaymentStatus = (storeId: string) => {
    return job.materialPayments?.find((p) => String(p.supplierId) === String(storeId));
  };

  const isStorePaid = (storeId: string) => {
    return getStorePaymentStatus(storeId)?.status === 'paid';
  };

  const allStoresPaid = Object.keys(materialsByStore).length > 0 && Object.keys(materialsByStore).every(
    storeId => isStorePaid(storeId)
  );
  const displayStoreOrders: JobStoreOrder[] = (job.storeOrders && job.storeOrders.length > 0)
    ? job.storeOrders
    : Object.entries(materialsByStore).map(([storeId, store]) => ({
        storeId,
        orderId: `legacy-${storeId}`,
        items: store.materials.map(material => ({
          productId: material.productId,
          name: material.name,
          qty: material.qty,
          unitPrice: material.unitPrice,
          qualityTier: material.qualityTier,
          imageUrl: material.imageUrl,
        })),
        storeName: store.name,
        deliveryType: 'SELF' as const,
        deliveryFee: 0,
        deliveryStatus: 'SelfCollect' as const,
        paymentStatus: 'Paid' as const,
        invoiceId: '',
        createdAt: job.createdAt,
        payment: { materialsPaid: isStorePaid(storeId), deliveryPaid: false },
      }));
  const paidOrderIds = new Set(
    (job.materialPayments || [])
      .filter(payment => payment.status === 'paid')
      .map(payment => payment.orderId)
      .filter(Boolean)
  );
  const paidCards = displayStoreOrders.filter(card => {
    const isLegacyCard = card.orderId.startsWith('legacy-');
    const payment = isLegacyCard
      ? (job.materialPayments?.find(p => p.orderId === card.orderId)
          || job.materialPayments?.find(p => !p.orderId && p.supplierId === card.storeId))
      : job.materialPayments?.find(p => p.orderId === card.orderId);
    return !!card.payment?.materialsPaid || payment?.status === 'paid' || paidOrderIds.has(card.orderId);
  });
  const pendingCards = displayStoreOrders.filter(card => !paidCards.some(paid => paid.orderId === card.orderId));

  const getSupplierMeta = (storeId: string) => {
    return suppliers.find(s => s.id === storeId);
  };

  const getStoreOrder = (orderId: string): JobStoreOrder | undefined => {
    return job.storeOrders?.find(so => so.orderId === orderId);
  };
  const suggestedMaterialsOnly = userSuggestions.filter((s) => s.status === 'pending');

  const handleOpenPaymentDialog = (storeId: string, storeName: string, hasDelivery: boolean, deliveryFee?: number, orderId?: string) => {
    const store = materialsByStore[storeId];
    setSelectedStore({
      orderId,
      id: storeId,
      name: storeName,
      hasDelivery,
      deliveryFee,
      materials: store.materials,
    });
    setSelectedCardId(defaultCard?.id || '');
    setCvc('');
    setError(null);
    setPaymentDialogOpen(true);
  };

  const validateCvc = (value: string): boolean => {
    return /^\d{3,4}$/.test(value);
  };

  const handleConfirmPayment = async () => {
    if (!selectedStore || !selectedCardId) {
      setError('Please select a payment card');
      return;
    }

    if (!validateCvc(cvc)) {
      setError('Please enter a valid CVC (3-4 digits)');
      return;
    }
    
    const selectedCard = savedCards.find(c => c.id === selectedCardId);
    
    setIsProcessing(true);
    setError(null);
    try {
      const supplier = getSupplierMeta(selectedStore.id);
      const storeOrder = selectedStore.orderId ? getStoreOrder(selectedStore.orderId) : undefined;

      const deliveryType = storeOrder?.deliveryType || (supplier?.hasDelivery ? 'STORE' : 'SELF');
      const deliveryFee = storeOrder?.deliveryFee || supplier?.deliveryFee || 0;
      const deliveryProviderId = storeOrder?.deliveryProviderId;

      await onPayForStore(
        selectedStore.id,
        selectedCardId,
        selectedCard?.last4 || '****',
        {
          deliveryType,
          deliveryFee,
          deliveryProviderId,
          orderId: storeOrder?.orderId,
        }
      );
      setPaymentDialogOpen(false);
      setSelectedStore(null);
      setCvc('');
    } catch (err) {
      setError('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const calculateStoreTotal = (storeId: string) => {
    const store = materialsByStore[storeId];
    return store.total;
  };

  const calculateMaterialsTotal = (storeId: string) => {
    const store = materialsByStore[storeId];
    return store.total;
  };

  const openDeliveryDialog = (storeId: string) => {
    setDeliveryStoreId(storeId);
    setSelectedDeliveryType('SELF');
    setSelectedProviderId('');
    setDeliveryDialogOpen(true);
  };

  const openPurchaseFlow = (storeId: string, orderId?: string) => {
    const order = orderId ? displayStoreOrders.find(entry => entry.orderId === orderId) : undefined;
    const store = materialsByStore[storeId];
    const orderMaterials = order
      ? order.items.map(item => ({
          supplierId: storeId,
          supplierName: order.storeName || store?.name || 'Store',
          productId: item.productId,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          qualityTier: item.qualityTier,
          unit: 'unit',
        }))
      : store?.materials || [];
    const supplier = getSupplierMeta(storeId);
    setPurchaseFlowStore({
      orderId,
      id: storeId,
      name: order?.storeName || store?.name || 'Store',
      hasDelivery: supplier?.hasDelivery || false,
      deliveryFee: supplier?.deliveryFee,
      materials: orderMaterials,
    });
    setSelectedDeliveryType('SELF');
    setSelectedProviderId('');
    setSelectedCardId(defaultCard?.id || '');
    setCvc('');
    setError(null);
    setPurchaseFlowStep(1);
    setPurchaseFlowOpen(true);
  };

  const handlePurchaseFlowStep1Next = () => {
    if (
      purchaseFlowStore &&
      hasCourierOption &&
      selectedDeliveryType === 'PROVIDER' &&
      !selectedProviderId
    ) {
      return;
    }
    setPurchaseFlowStep(2);
  };

  const handlePurchaseFlowComplete = async () => {
    if (!purchaseFlowStore || !selectedCardId) {
      setError('Please select a payment card');
      return;
    }
    if (!validateCvc(cvc)) {
      setError('Please enter a valid CVC (3-4 digits)');
      return;
    }
    const supplier = getSupplierMeta(purchaseFlowStore.id);
    let fee = 0;
    if (selectedDeliveryType === 'STORE') {
      fee = supplier?.deliveryFee || 0;
    } else if (selectedDeliveryType === 'PROVIDER') {
      const provider = deliveryProviders.find(p => p.id === selectedProviderId);
      fee = provider?.baseRate || 0;
    }
    setIsProcessing(true);
    setError(null);
    try {
      await onSelectDeliveryOption(purchaseFlowStore.id, {
        deliveryType: selectedDeliveryType,
        deliveryFee: fee,
        deliveryProviderId: selectedDeliveryType === 'PROVIDER' ? selectedProviderId : undefined,
        orderId: purchaseFlowStore.orderId,
      });
      const selectedCard = savedCards.find(c => c.id === selectedCardId);
      await onPayForStore(
        purchaseFlowStore.id,
        selectedCardId,
        selectedCard?.last4 || '****',
        {
          deliveryType: selectedDeliveryType,
          deliveryFee: fee,
          deliveryProviderId: selectedDeliveryType === 'PROVIDER' ? selectedProviderId : undefined,
          orderId: purchaseFlowStore.orderId,
        }
      );
      setPurchaseFlowOpen(false);
      setPurchaseFlowStore(null);
      setCvc('');
    } catch (err) {
      setError('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDeliveryOption = async () => {
    if (!deliveryStoreId) return;
    const supplier = getSupplierMeta(deliveryStoreId);
    let fee = 0;

    if (selectedDeliveryType === 'STORE') {
      fee = supplier?.deliveryFee || 0;
    } else if (selectedDeliveryType === 'PROVIDER') {
      const provider = deliveryProviders.find(p => p.id === selectedProviderId);
      fee = provider?.baseRate || 0;
    }

    await onSelectDeliveryOption(deliveryStoreId, {
      deliveryType: selectedDeliveryType,
      deliveryFee: fee,
      deliveryProviderId: selectedDeliveryType === 'PROVIDER' ? selectedProviderId : undefined,
    });

    setDeliveryDialogOpen(false);
  };

  if (materials.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Materials
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-6">
            Materials list has not been submitted by provider yet.
          </p>
          <p className="text-sm text-muted-foreground text-center">
            After inspection, the provider will select and submit the required materials for your approval.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!job.laborPaid) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Materials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg flex items-start gap-3">
            <Lock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Pay service first</p>
              <p className="text-sm text-muted-foreground">
                You must pay the service/labor fee before you can pay for materials.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {Object.entries(materialsByStore).map(([storeId, store]) => (
              <div key={storeId} className="p-3 border rounded-lg opacity-75">
                <p className="font-medium">{store.name}</p>
                <p className="text-sm text-muted-foreground">
                  {store.materials.length} items · {formatCurrency(store.total, { decimals: 2 })}
                </p>
              </div>
            ))}
          </div>
          {onSuggestAlternatives && (
            <Button variant="outline" onClick={onSuggestAlternatives} className="w-full">
              <AlertCircle className="h-4 w-4 mr-2" />
              Suggest Alternative Materials
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Order Materials
            </span>
            <div className="flex items-center gap-2">
              {allStoresPaid && (
                <Badge className="bg-success text-success-foreground">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  All Paid
                </Badge>
              )}
              {onSuggestAlternatives && (
                <Button size="sm" variant="outline" onClick={onSuggestAlternatives}>
                  <AlertCircle className="h-4 w-4 mr-1" />
                  Suggest Alternatives
                </Button>
              )}
              {onAddMaterials && job.status === 'ASSIGNED' && (
                <Button size="sm" variant="outline" onClick={onAddMaterials}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Materials
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {job.status === 'ASSIGNED'
              ? 'Pay for materials per store. Job will start once all materials are paid.'
              : 'Review your material orders per store.'}
          </p>

          {paidCards.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Paid materials</h4>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                {paidCards.map((storeOrder) => {
                  const storeId = storeOrder.storeId;
                  const storeName = storeOrder.storeName || materialsByStore[storeId]?.name || 'Store';
                  const isLegacyCard = storeOrder.orderId.startsWith('legacy-');
                  const paymentRecord = isLegacyCard
                    ? (job.materialPayments?.find(payment => payment.orderId === storeOrder.orderId)
                        || job.materialPayments?.find(payment => !payment.orderId && payment.supplierId === storeId))
                    : job.materialPayments?.find(payment => payment.orderId === storeOrder.orderId);
                  const itemsTotal = storeOrder.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
                  const mo = resolveMaterialOrderForStoreOrder(job, storeOrder);
                  const materialOrderKey = mo?.id ? String(mo.id) : storeOrder.orderId;
                  const batch = resolveMaterialBatchFromSnapshot(mo);
                  const driverLabel =
                    batch?.assignedDriverId &&
                    deliveryProviders.find((d) => d.id === batch.assignedDriverId)?.name;
                  const chosenCourier = storeOrder.deliveryProviderId
                    ? deliveryProviders.find((d) => d.id === storeOrder.deliveryProviderId)
                    : undefined;
                  const courierVehicleStr = chosenCourier
                    ? [chosenCourier.vehicleType, chosenCourier.numberPlate].filter(Boolean).join(' · ')
                    : undefined;
                  const moExtra = mo as unknown as {
                    activeTrackingId?: string;
                    activeTrackingToken?: string;
                  };
                  const trackingU = String(mo?.fulfillmentStatus || '').toUpperCase();
                  const trackingEligibleForStore = trackingU === 'OUT_FOR_DELIVERY';
                  const fullHref = `/user/jobs/${job.id}/store-orders/${encodeURIComponent(storeOrder.orderId)}`;
                  return (
                    <MaterialCard
                      key={materialOrderKey}
                      status="paid"
                      supplierName={storeName}
                      subtotal={itemsTotal}
                      items={storeOrder.items.map((item) => ({
                        rowKey: `${storeOrder.orderId}-${item.productId}`,
                        name: item.name,
                        qty: item.qty,
                        lineTotal: item.qty * item.unitPrice,
                      }))}
                      meta={
                        <div className="space-y-2 w-full">
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge variant="secondary" className="text-xs">
                              {fulfillmentStatusBadgeLabel(mo?.fulfillmentStatus)}
                            </Badge>
                            <Badge variant="outline">
                              {storeOrder.deliveryType === 'SELF' && 'Pickup'}
                              {storeOrder.deliveryType === 'STORE' && 'Store delivery'}
                              {storeOrder.deliveryType === 'PROVIDER' && 'Courier delivery'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Supplier:{' '}
                            <span className="text-foreground font-medium">{mo?.supplierName || storeName}</span>
                          </p>
                          {batch?.pickupAddress ? (
                            <p className="text-xs text-muted-foreground">Pickup: {batch.pickupAddress}</p>
                          ) : null}
                          {batch?.deliveryType === 'pickup' && (
                            <p className="text-xs text-muted-foreground">Collect your order at the supplier address above.</p>
                          )}
                          {batch?.deliveryAddress ? (
                            <p className="text-xs text-muted-foreground">Delivery address: {batch.deliveryAddress}</p>
                          ) : null}
                          {driverLabel ? (
                            <p className="text-xs text-muted-foreground">Courier: {driverLabel}</p>
                          ) : null}
                          {batch?.deliveryType === 'delivery' && mo && ['READY', 'OUT_FOR_DELIVERY'].includes(String(mo.fulfillmentStatus).toUpperCase()) && (
                            <p className="text-xs text-foreground">Delivery in progress — you will be notified at each step.</p>
                          )}
                        </div>
                      }
                      footer={
                        <div className="text-xs text-muted-foreground space-y-2">
                          <UnifiedTrackingSection
                            variant="embedded"
                            mode={
                              storeOrder.deliveryType === 'SELF'
                                ? 'self_pickup'
                                : storeOrder.deliveryType === 'STORE'
                                  ? 'store_delivery'
                                  : 'provider_delivery'
                            }
                            fulfillmentStatus={String(mo?.fulfillmentStatus || '')}
                            materialBatch={batch}
                            showLiveMap={false}
                            mapLat={null}
                            mapLng={null}
                            destination={batch?.deliveryAddress || undefined}
                            destinationCoords={job.location?.coordinates ?? null}
                            activeTrackingId={trackingEligibleForStore ? moExtra.activeTrackingId ?? null : null}
                            activeTrackingToken={trackingEligibleForStore ? moExtra.activeTrackingToken ?? null : null}
                            supplierDisplayName={mo?.supplierName || storeName}
                            supplierAddress={
                              batch?.pickupAddress && batch.pickupAddress.trim() !== ''
                                ? batch.pickupAddress
                                : undefined
                            }
                            assignedDriverName={driverLabel ?? null}
                            courierName={chosenCourier?.name ?? null}
                            courierVehicle={courierVehicleStr || null}
                            showConfirmDelivery={false}
                            fullTrackingHref={fullHref}
                          />
                          <p>Invoice: {storeOrder.invoiceId || 'Pending assignment'}</p>
                          <p>Paid at: {paymentRecord?.paidAt ? new Date(paymentRecord.paidAt).toLocaleString() : 'N/A'}</p>
                          <Button variant="outline" size="sm" className="mt-1" onClick={() => onViewStoreOrder(storeOrder.orderId)}>
                            View order
                          </Button>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border space-y-3">
            <div
              className="inline-flex rounded-lg border border-border p-1 bg-muted/30 transition-colors"
              role="tablist"
              aria-label="Materials"
            >
              <Button
                type="button"
                role="tab"
                aria-selected={userMaterialTab === 'pending'}
                size="sm"
                variant={userMaterialTab === 'pending' ? 'default' : 'ghost'}
                className="h-8 transition-colors duration-150"
                onClick={() => setUserMaterialTab('pending')}
              >
                Pending materials
              </Button>
              <Button
                type="button"
                role="tab"
                aria-selected={userMaterialTab === 'suggested'}
                size="sm"
                variant={userMaterialTab === 'suggested' ? 'default' : 'ghost'}
                className="h-8 gap-2 transition-colors duration-150"
                onClick={() => setUserMaterialTab('suggested')}
              >
                Suggested materials
                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                  {suggestedMaterialsOnly.length}
                </Badge>
              </Button>
            </div>

            {userMaterialTab === 'pending' ? (
              <div className="min-h-[4rem] space-y-3 animate-in fade-in duration-200" role="tabpanel">
                {pendingCards.length > 0 ? (
                  <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                    {pendingCards.map((storeOrder) => {
                      const storeId = storeOrder.storeId;
                      const storeName = storeOrder.storeName || materialsByStore[storeId]?.name || 'Store';
                      const isLegacyCard = storeOrder.orderId.startsWith('legacy-');
                      const paymentRecord = isLegacyCard
                        ? (job.materialPayments?.find(payment => payment.orderId === storeOrder.orderId)
                            || job.materialPayments?.find(payment => !payment.orderId && payment.supplierId === storeId))
                        : job.materialPayments?.find(payment => payment.orderId === storeOrder.orderId);
                      const isPaid = !!storeOrder.payment?.materialsPaid || paymentRecord?.status === 'paid';
                      const itemsTotal = storeOrder.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
                      const canPay =
                        !isPaid &&
                        ['ASSIGNED', 'INSPECTED', 'SERVICE_PRICE_SUBMITTED', 'SERVICE_PAID', 'MATERIALS_SUBMITTED', 'MATERIALS_PAID', 'IN_PROGRESS'].includes(job.status);
                      const canDelete =
                        Boolean(onDeleteMaterial) &&
                        (job.status === 'ASSIGNED' || job.status === 'MATERIALS_SUBMITTED');

                      return (
                        <MaterialCard
                          key={storeOrder.orderId}
                          status="pending"
                          supplierName={storeName}
                          subtotal={itemsTotal}
                          items={storeOrder.items.map((item) => ({
                            rowKey: `${storeOrder.orderId}-${item.productId}`,
                            name: item.name,
                            qty: item.qty,
                            lineTotal: item.qty * item.unitPrice,
                          }))}
                          meta={
                            <>
                              {storeOrder.sourceUserSuggestionId ? (
                                <Badge variant="secondary" className="text-[10px] w-fit">
                                  From your suggestion
                                </Badge>
                              ) : null}
                              <div className="flex flex-wrap gap-2 items-center">
                                <Badge variant="outline">
                                  {storeOrder.deliveryType === 'SELF' && 'Self collection'}
                                  {storeOrder.deliveryType === 'STORE' && 'Store delivery'}
                                  {storeOrder.deliveryType === 'PROVIDER' && 'Delivery provider'}
                                </Badge>
                                {storeOrder.deliveryFee > 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    + {formatCurrency(storeOrder.deliveryFee)} delivery (pay later)
                                  </span>
                                ) : null}
                                {storeOrder.deliveryStatus === 'PendingApproval' ? (
                                  <Badge variant="outline" className="text-xs">
                                    Awaiting delivery provider approval
                                  </Badge>
                                ) : null}
                              </div>
                            </>
                          }
                          footer={
                            canDelete && onDeleteMaterial ? (
                              <div className="space-y-2 pt-1 border-t border-border">
                                <p className="text-xs font-medium text-muted-foreground">Remove lines (before payment)</p>
                                <div className="flex flex-wrap gap-2 justify-end">
                                  {storeOrder.items.map((item) => (
                                    <Button
                                      key={`del-${item.productId}`}
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 text-destructive"
                                      onClick={() => onDeleteMaterial(lineFromOrderItem(storeId, storeName, item))}
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      {item.name}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            ) : undefined
                          }
                          actions={
                            canPay ? (
                              <Button
                                size="sm"
                                className="btn-accent"
                                onClick={() => openPurchaseFlow(storeId, storeOrder.orderId)}
                              >
                                <CreditCard className="h-3 w-3 mr-1" />
                                {`Pay ${storeName}`}
                              </Button>
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-8 text-center">
                    No pending materials. Suggested items appear under Suggested until your provider approves them.
                  </p>
                )}
              </div>
            ) : (
              <div className="min-h-[4rem] animate-in fade-in duration-200" role="tabpanel">
                {suggestedMaterialsOnly.length > 0 ? (
                  <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                    {suggestedMaterialsOnly.map((suggestion) => {
                      const storeName = suggestion.suggested.supplierName || 'Store';
                      const lineTotal = suggestion.suggested.qty * suggestion.suggested.unitPrice;
                      return (
                        <MaterialCard
                          key={suggestion.id}
                          status="suggested"
                          supplierName={storeName}
                          subtotal={lineTotal}
                          items={[
                            {
                              rowKey: suggestion.id,
                              name: suggestion.suggested.name,
                              qty: suggestion.suggested.qty,
                              lineTotal,
                            },
                          ]}
                          meta={
                            <>
                              <Badge variant="secondary">Waiting for provider approval</Badge>
                              {suggestion.message ? (
                                <p className="text-xs text-muted-foreground">{suggestion.message}</p>
                              ) : null}
                            </>
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-8 text-center">
                    No suggested materials. Use Suggest Alternatives to add items from stores.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delivery Option Dialog */}
      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deliveryStoreId
                ? `Choose Delivery Option for ${materialsByStore[deliveryStoreId].name}`
                : 'Choose Delivery Option'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <RadioGroup
              value={selectedDeliveryType}
              onValueChange={(value) => {
                if (value === 'SELF' || value === 'STORE' || value === 'PROVIDER') {
                  setSelectedDeliveryType(value);
                }
              }}
            >
              <div className="p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="SELF" id="self-collect" />
                  <Label htmlFor="self-collect" className="cursor-pointer flex-1">
                    <p className="font-medium">I will collect myself</p>
                    <p className="text-sm text-muted-foreground">
                      No delivery fee added
                    </p>
                  </Label>
                </div>
              </div>

              {deliveryStoreId && getSupplierMeta(deliveryStoreId)?.hasDelivery && (
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="STORE" id="store-delivery" />
                    <Label htmlFor="store-delivery" className="cursor-pointer flex-1">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">Use Store Delivery</p>
                          <p className="text-sm text-muted-foreground">
                            Delivered by {getSupplierMeta(deliveryStoreId)?.name}
                          </p>
                        </div>
                        <p className="font-medium">
                          {formatCurrency(getSupplierMeta(deliveryStoreId)?.deliveryFee || 0)}
                        </p>
                      </div>
                    </Label>
                  </div>
                </div>
              )}

              {hasCourierOption && (
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="PROVIDER" id="provider-delivery" />
                    <Label htmlFor="provider-delivery" className="cursor-pointer flex-1">
                      <p className="font-medium">Hire a Delivery Provider</p>
                      <p className="text-sm text-muted-foreground">
                        Choose from nearby delivery providers
                      </p>
                    </Label>
                  </div>
                </div>
              )}
            </RadioGroup>

            {hasCourierOption && selectedDeliveryType === 'PROVIDER' && (
              <div className="space-y-2">
                <Label>Select a provider</Label>
                <RadioGroup
                  value={selectedProviderId}
                  onValueChange={setSelectedProviderId}
                >
                  {deliveryProviders.map(provider => (
                    <div
                      key={provider.id}
                      className="flex items-center space-x-3 p-3 border border-border rounded-lg"
                    >
                      <RadioGroupItem value={provider.id} id={provider.id} />
                      <Label htmlFor={provider.id} className="flex-1 cursor-pointer">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-medium">{provider.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {[provider.vehicleType, provider.rating != null && `★ ${provider.rating}`, `ETA: ${provider.estimatedTime}`].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <p className="font-medium">{formatCurrency(provider.baseRate)}</p>
                        </div>
                      </Label>
                    </div>
                  ))}
                  {deliveryProvidersError && (
                    <p className="text-xs text-destructive">{deliveryProvidersError}</p>
                  )}
                  {!deliveryProvidersError && deliveryProviders.length === 0 && (
                    <p className="text-xs text-muted-foreground">No delivery providers available.</p>
                  )}
                </RadioGroup>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveryDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDeliveryOption}
              disabled={
                hasCourierOption && selectedDeliveryType === 'PROVIDER' && !selectedProviderId
              }
              className="btn-accent"
            >
              Save Delivery Option
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Pay for Materials
            </DialogTitle>
            <DialogDescription>
              Complete payment for materials from {selectedStore?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Order Summary */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="font-medium mb-2">Order Summary</p>
              <div className="space-y-1 text-sm">
                {selectedStore?.materials.map(m => (
                  <div key={m.productId} className="flex justify-between">
                    <span className="text-muted-foreground">{m.name} × {m.qty}</span>
                    <span>{formatCurrency(m.qty * m.unitPrice, { decimals: 2 })}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-1 mt-2">
                  <div className="flex justify-between font-medium">
                    <span>Subtotal</span>
                    <span>{formatCurrency(selectedStore ? calculateStoreTotal(selectedStore.id) : 0, { decimals: 2 })}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Selection (if no store delivery and couriers exist) */}
            {selectedStore && !selectedStore.hasDelivery && hasCourierOption && (
              <div>
                <Label className="mb-2 block">Select Delivery Provider</Label>
                <RadioGroup value={selectedDeliveryId} onValueChange={setSelectedDeliveryId}>
                  {deliveryProviders.map(provider => (
                    <div 
                      key={provider.id} 
                      className="flex items-center space-x-3 p-3 border border-border rounded-lg"
                    >
                      <RadioGroupItem value={provider.id} id={provider.id} />
                      <Label htmlFor={provider.id} className="flex-1 cursor-pointer">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-medium">{provider.name}</p>
                            <p className="text-xs text-muted-foreground">{provider.estimatedTime}</p>
                          </div>
                          <p className="font-medium">{formatCurrency(provider.baseRate)}</p>
                        </div>
                      </Label>
                    </div>
                  ))}
                  {deliveryProvidersError && (
                    <p className="text-xs text-destructive">{deliveryProvidersError}</p>
                  )}
                  {!deliveryProvidersError && deliveryProviders.length === 0 && (
                    <p className="text-xs text-muted-foreground">No delivery providers available.</p>
                  )}
                </RadioGroup>
              </div>
            )}

            {/* Delivery fee display - pay after approval */}
            {selectedStore?.hasDelivery && selectedStore.deliveryFee && selectedStore.deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Truck className="h-4 w-4" />
                  Delivery (pay after approval)
                </span>
                <span>{formatCurrency(selectedStore.deliveryFee, { decimals: 2 })}</span>
              </div>
            )}

            {/* Card Selection */}
            <div>
              <Label className="mb-2 block">Payment Method</Label>
              <RadioGroup value={selectedCardId} onValueChange={setSelectedCardId}>
                {savedCards.map(card => (
                  <div 
                    key={card.id} 
                    className={cn(
                      "flex items-center space-x-3 p-3 border rounded-lg transition-colors",
                      selectedCardId === card.id 
                        ? "border-primary bg-primary/5" 
                        : "border-border"
                    )}
                  >
                    <RadioGroupItem value={card.id} id={`pay-${card.id}`} />
                    <Label htmlFor={`pay-${card.id}`} className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span className="capitalize">{card.brand}</span>
                        <span>•••• {card.last4}</span>
                        {card.isDefault && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* CVC Input */}
            <div>
              <Label htmlFor="material-cvc" className="mb-2 block">CVC / Security Code</Label>
              <Input
                id="material-cvc"
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="123"
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                className="max-w-[120px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter the 3 or 4 digit code on your card
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmPayment}
              disabled={!selectedCardId || isProcessing}
              className="btn-accent"
            >
              {isProcessing ? 'Processing...' : `Pay materials ${formatCurrency(selectedStore ? calculateMaterialsTotal(selectedStore.id) : 0, { decimals: 2 })}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified Purchase Flow Modal */}
      <Dialog open={purchaseFlowOpen} onOpenChange={(open) => {
        if (!open) {
          setPurchaseFlowOpen(false);
          setPurchaseFlowStore(null);
          setError(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {purchaseFlowStep === 1
                ? `Purchase from ${purchaseFlowStore?.name}`
                : `Confirm Payment - ${purchaseFlowStore?.name}`}
            </DialogTitle>
            <DialogDescription>
              {purchaseFlowStep === 1
                ? 'Choose delivery option, then complete payment.'
                : 'Review your order and confirm payment.'}
            </DialogDescription>
          </DialogHeader>

          {purchaseFlowStep === 1 && purchaseFlowStore && (
            <>
              <div className="space-y-4 py-4">
                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  <p className="font-medium mb-2">Order Summary</p>
                  {purchaseFlowStore.materials.map(m => (
                    <div key={m.productId} className="flex justify-between">
                      <span className="text-muted-foreground">{m.name} × {m.qty}</span>
                      <span>{formatCurrency(m.qty * m.unitPrice, { decimals: 2 })}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-1 mt-2 flex justify-between font-medium">
                    <span>Subtotal</span>
                    <span>{formatCurrency(purchaseFlowStore.materials.reduce((s, m) => s + m.qty * m.unitPrice, 0), { decimals: 2 })}</span>
                  </div>
                </div>

                <RadioGroup value={selectedDeliveryType} onValueChange={v => setSelectedDeliveryType(v as 'SELF' | 'STORE' | 'PROVIDER')}>
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="SELF" id="purchase-self" />
                      <Label htmlFor="purchase-self" className="cursor-pointer flex-1">
                        <p className="font-medium">I will collect myself</p>
                        <p className="text-sm text-muted-foreground">No delivery fee added</p>
                      </Label>
                    </div>
                  </div>

                  {purchaseFlowStore.hasDelivery && (
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="STORE" id="purchase-store" />
                        <Label htmlFor="purchase-store" className="cursor-pointer flex-1">
                          <div className="flex justify-between">
                            <div>
                              <p className="font-medium">Use Store Delivery</p>
                              <p className="text-sm text-muted-foreground">Delivered by {purchaseFlowStore.name}</p>
                            </div>
                            <p className="font-medium">{formatCurrency(purchaseFlowStore.deliveryFee || 0)}</p>
                          </div>
                        </Label>
                      </div>
                    </div>
                  )}

                  {hasCourierOption && (
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="PROVIDER" id="purchase-provider" />
                        <Label htmlFor="purchase-provider" className="cursor-pointer flex-1">
                          <p className="font-medium">Request a delivery provider</p>
                          <p className="text-sm text-muted-foreground">Choose from nearby delivery providers</p>
                        </Label>
                      </div>
                    </div>
                  )}
                </RadioGroup>

                {hasCourierOption && selectedDeliveryType === 'PROVIDER' && (
                  <div className="space-y-2">
                    <Label>Select a delivery provider</Label>
                    <RadioGroup value={selectedProviderId} onValueChange={setSelectedProviderId}>
                      {deliveryProviders.map(provider => (
                        <div key={provider.id} className="flex items-center space-x-3 p-3 border border-border rounded-lg">
                          <RadioGroupItem value={provider.id} id={`purchase-${provider.id}`} />
                          <Label htmlFor={`purchase-${provider.id}`} className="flex-1 cursor-pointer">
                            <div className="flex justify-between items-start">
                              <div className="space-y-0.5">
                                <p className="font-medium">{provider.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {provider.vehicleType}
                                  {provider.numberPlate && ` · ${provider.numberPlate}`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {provider.rating != null && `★ ${provider.rating}`}
                                  {provider.rating != null && provider.estimatedTime && ' · '}
                                  {provider.estimatedTime && `ETA: ${provider.estimatedTime}`}
                                </p>
                              </div>
                              <p className="font-medium shrink-0 ml-2">{formatCurrency(provider.baseRate)}</p>
                            </div>
                          </Label>
                        </div>
                      ))}
                      {deliveryProvidersError && (
                        <p className="text-xs text-destructive">{deliveryProvidersError}</p>
                      )}
                      {!deliveryProvidersError && deliveryProviders.length === 0 && (
                        <p className="text-xs text-muted-foreground">No delivery providers available.</p>
                      )}
                    </RadioGroup>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPurchaseFlowOpen(false)}>Cancel</Button>
                <Button
                  onClick={handlePurchaseFlowStep1Next}
                  disabled={hasCourierOption && selectedDeliveryType === 'PROVIDER' && !selectedProviderId}
                  className="btn-accent"
                >
                  Continue to Payment
                </Button>
              </DialogFooter>
            </>
          )}

          {purchaseFlowStep === 2 && purchaseFlowStore && (
            <>
              <div className="space-y-4 py-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-2">Order Summary</p>
                  <div className="space-y-1 text-sm">
                    {purchaseFlowStore.materials.map(m => (
                      <div key={m.productId} className="flex justify-between">
                        <span className="text-muted-foreground">{m.name} × {m.qty}</span>
                        <span>{formatCurrency(m.qty * m.unitPrice, { decimals: 2 })}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border pt-1 mt-2">
                    <div className="flex justify-between font-medium">
                      <span>Subtotal</span>
                      <span>{formatCurrency(purchaseFlowStore.materials.reduce((s, m) => s + m.qty * m.unitPrice, 0), { decimals: 2 })}</span>
                    </div>
                  </div>
                  {selectedDeliveryType !== 'SELF' && selectedDeliveryType === 'STORE' && purchaseFlowStore.deliveryFee && purchaseFlowStore.deliveryFee > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground mt-1">
                      <span>Delivery (pay after approval)</span>
                      <span>{formatCurrency(purchaseFlowStore.deliveryFee, { decimals: 2 })}</span>
                    </div>
                  )}
                  {selectedDeliveryType === 'PROVIDER' && (
                    <div className="flex justify-between text-sm text-muted-foreground mt-1">
                      <span>Delivery (pay after approval)</span>
                      <span>{formatCurrency(deliveryProviders.find(p => p.id === selectedProviderId)?.baseRate ?? 0, { decimals: 2 })}</span>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">Payment Method</Label>
                  <RadioGroup value={selectedCardId} onValueChange={setSelectedCardId}>
                    {savedCards.map(card => (
                      <div
                        key={card.id}
                        className={cn(
                          "flex items-center space-x-3 p-3 border rounded-lg transition-colors",
                          selectedCardId === card.id ? "border-primary bg-primary/5" : "border-border"
                        )}
                      >
                        <RadioGroupItem value={card.id} id={`purchase-pay-${card.id}`} />
                        <Label htmlFor={`purchase-pay-${card.id}`} className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            <span className="capitalize">{card.brand}</span>
                            <span>•••• {card.last4}</span>
                            {card.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label htmlFor="purchase-cvc" className="mb-2 block">CVC / Security Code</Label>
                  <Input
                    id="purchase-cvc"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="123"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                    className="max-w-[120px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Enter the 3 or 4 digit code on your card</p>
                </div>

                {error && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPurchaseFlowStep(1)}>Back</Button>
                <Button
                  onClick={handlePurchaseFlowComplete}
                  disabled={!selectedCardId || isProcessing}
                  className="btn-accent"
                >
                  {isProcessing ? 'Processing...' : `Pay ${formatCurrency(purchaseFlowStore.materials.reduce((s, m) => s + m.qty * m.unitPrice, 0), { decimals: 2 })}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
