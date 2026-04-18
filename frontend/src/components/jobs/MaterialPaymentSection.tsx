import { useState } from 'react';
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
import { OrderCard, OrderCardViewModel } from '@/components/orders/OrderCard';
import { 
  CreditCard, 
  Truck, 
  Package, 
  CheckCircle,
  Store,
  Plus,
  Trash2,
  AlertCircle,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';

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

interface PendingMaterialOrderCardProps {
  job: Job;
  storeOrder: JobStoreOrder;
  storeName: string;
  isPaid: boolean;
  showSuggestedOriginBadge: boolean;
  onPurchase: () => void;
  onDeleteMaterial?: (material: MaterialLine) => void;
  purchaseButtonLabel: string;
}

function PendingMaterialOrderCard({
  job,
  storeOrder,
  storeName,
  isPaid,
  showSuggestedOriginBadge,
  onPurchase,
  onDeleteMaterial,
  purchaseButtonLabel,
}: PendingMaterialOrderCardProps) {
  const storeId = storeOrder.storeId;
  const storeMaterials: MaterialLine[] = storeOrder.items.map(item => ({
    supplierId: storeId,
    supplierName: storeName,
    productId: item.productId,
    name: item.name,
    qty: item.qty,
    unitPrice: item.unitPrice,
    qualityTier: item.qualityTier,
    unit: 'unit',
    imageUrl: item.imageUrl,
  }));
  const storeTotal = storeOrder.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

  return (
    <div className={cn('p-4 border rounded-lg', 'border-border')}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium flex items-center gap-2 flex-wrap">
              <span className="truncate">{storeName}</span>
              {showSuggestedOriginBadge && (
                <Badge variant="secondary" className="text-[10px]">
                  Suggested
                </Badge>
              )}
            </p>
            <p className="text-sm text-muted-foreground">{storeOrder.items.length} items</p>
          </div>
        </div>
        <div className="text-left sm:text-right space-y-1 w-full sm:w-auto">
          <p className="font-bold">
            {formatCurrency(storeTotal, { decimals: 2 })}
            {storeOrder.deliveryFee > 0 && (
              <span className="text-muted-foreground font-normal text-sm ml-1">
                + {formatCurrency(storeOrder.deliveryFee)} delivery (pay later)
              </span>
            )}
          </p>
          <div className="flex flex-col items-start sm:items-end gap-1">
            <Badge variant="outline">
              {storeOrder.deliveryType === 'SELF' && 'Self Collection'}
              {storeOrder.deliveryType === 'STORE' && 'Store Delivery'}
              {storeOrder.deliveryType === 'PROVIDER' && 'Delivery Provider'}
            </Badge>
            {storeOrder.deliveryStatus === 'PendingApproval' && (
              <Badge variant="outline" className="text-xs">
                Awaiting Delivery Provider Approval
              </Badge>
            )}
          </div>
          {!isPaid &&
            ['ASSIGNED', 'INSPECTED', 'SERVICE_PRICE_SUBMITTED', 'SERVICE_PAID', 'MATERIALS_SUBMITTED', 'MATERIALS_PAID', 'IN_PROGRESS'].includes(
              job.status
            ) && (
              <div className="flex flex-col items-stretch sm:items-end gap-1 w-full sm:w-auto pt-1">
                <Button
                  size="sm"
                  className="btn-accent w-full sm:w-auto max-w-full h-auto whitespace-normal break-words text-xs leading-tight px-3 py-2"
                  onClick={onPurchase}
                >
                  <CreditCard className="h-3 w-3 mr-1 shrink-0" />
                  {purchaseButtonLabel}
                </Button>
              </div>
            )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border space-y-2">
        {storeMaterials.map(m => (
          <div key={m.productId} className="flex justify-between items-center text-sm gap-2">
            <span className="text-muted-foreground">
              {m.name} × {m.qty}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <span>{formatCurrency(m.qty * m.unitPrice, { decimals: 2 })}</span>
              {!isPaid &&
                onDeleteMaterial &&
                (job.status === 'ASSIGNED' || job.status === 'MATERIALS_SUBMITTED') && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => onDeleteMaterial(m)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
  const [pendingViewTab, setPendingViewTab] = useState<'orders' | 'suggestions'>('orders');
  const [purchaseFlowStore, setPurchaseFlowStore] = useState<{
    orderId?: string;
    id: string;
    name: string;
    hasDelivery: boolean;
    deliveryFee?: number;
    materials: MaterialLine[];
  } | null>(null);

  // Group materials by store
  const materials = job.materials || [];
  const materialsByStore = materials.reduce((acc, m) => {
    if (!acc[m.supplierId]) {
      acc[m.supplierId] = {
        id: m.supplierId,
        name: m.supplierName,
        materials: [],
        total: 0,
      };
    }
    acc[m.supplierId].materials.push(m);
    acc[m.supplierId].total += m.qty * m.unitPrice;
    return acc;
  }, {} as Record<string, { id: string; name: string; materials: MaterialLine[]; total: number }>);

  // Check payment status from job.materialPayments
  const getStorePaymentStatus = (storeId: string) => {
    return job.materialPayments?.find(p => p.supplierId === storeId);
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
  const getOrderForAcceptedSuggestion = (suggestion: UserMaterialSuggestion): JobStoreOrder | undefined => {
    if (suggestion.status !== 'accepted') return undefined;
    const linked = pendingCards.find(card => card.sourceUserSuggestionId === suggestion.id);
    if (linked) return linked;
    return [...pendingCards].reverse().find(
      card =>
        card.storeId === suggestion.suggested.supplierId &&
        card.items.some(item => item.productId === suggestion.suggested.productId)
    );
  };
  const acceptedSuggestionOrderIds = new Set(
    userSuggestions
      .filter(suggestion => suggestion.status === 'accepted')
      .map(suggestion => getOrderForAcceptedSuggestion(suggestion)?.orderId)
      .filter((orderId): orderId is string => !!orderId)
  );
  const pendingOrderCards = pendingCards.filter(card => !acceptedSuggestionOrderIds.has(card.orderId));
  const suggestionsForDisplay = userSuggestions.filter(suggestion => {
    if (suggestion.status === 'pending') return true;
    if (suggestion.status === 'accepted') return !!getOrderForAcceptedSuggestion(suggestion);
    return false;
  });
  const hasPendingSuggestionItems = suggestionsForDisplay.length > 0;
  const showPendingSubTabs = pendingOrderCards.length > 0 && hasPendingSuggestionItems;

  const toOrderCardViewModel = (
    storeOrder: JobStoreOrder,
    storeNameFallback: string
  ): OrderCardViewModel => {
    const itemsTotal = storeOrder.items.reduce(
      (sum, item) => sum + item.unitPrice * item.qty,
      0
    );
    const total = itemsTotal + (storeOrder.deliveryFee || 0);

    const deliveryTypeLabel =
      storeOrder.deliveryType === 'SELF'
        ? 'Self'
        : storeOrder.deliveryType === 'STORE'
        ? 'Store'
        : 'Provider';

    const statusConfig: Record<
      string,
      { label: string; className: string }
    > = {
      Processing: { label: 'Processing', className: 'bg-warning/20 text-warning' },
      OnTheWay: { label: 'On the Way', className: 'bg-primary/20 text-primary' },
      Delivered: { label: 'Delivered', className: 'bg-success/20 text-success' },
      Approved: { label: 'Processing', className: 'bg-warning/20 text-warning' },
      PendingApproval: {
        label: 'Pending Approval',
        className: 'bg-warning/20 text-warning',
      },
    };

    const status = statusConfig[storeOrder.deliveryStatus] || statusConfig.Processing;

    return {
      id: storeOrder.orderId,
      storeName: storeOrder.storeName || storeNameFallback,
      itemsCount: storeOrder.items.reduce((sum, i) => sum + i.qty, 0),
      total,
      deliveryFee: storeOrder.deliveryFee,
      deliveryTypeLabel,
      deliveryStatusLabel: status.label,
      deliveryStatusClassName: status.className,
      createdAt: storeOrder.createdAt,
    };
  };

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
    if (purchaseFlowStore && selectedDeliveryType === 'PROVIDER' && !selectedProviderId) return;
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
              <h4 className="text-sm font-semibold text-muted-foreground">Paid Materials</h4>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                {paidCards.map((storeOrder) => {
                  const storeId = storeOrder.storeId;
                  const storeName = storeOrder.storeName || materialsByStore[storeId]?.name || 'Store';
                  const isLegacyCard = storeOrder.orderId.startsWith('legacy-');
                  const paymentRecord = isLegacyCard
                    ? (job.materialPayments?.find(payment => payment.orderId === storeOrder.orderId)
                        || job.materialPayments?.find(payment => !payment.orderId && payment.supplierId === storeId))
                    : job.materialPayments?.find(payment => payment.orderId === storeOrder.orderId);
                  const vm = toOrderCardViewModel(storeOrder, storeName);
                  return (
                    <div key={storeOrder.orderId} className="p-4 border rounded-lg border-success/50 bg-success/5 space-y-2">
                      <OrderCard order={vm} onClick={() => onViewStoreOrder(storeOrder.orderId)} />
                      <div className="text-xs text-muted-foreground">
                        <p>Invoice: {storeOrder.invoiceId || 'Pending assignment'}</p>
                        <p>Paid at: {paymentRecord?.paidAt ? new Date(paymentRecord.paidAt).toLocaleString() : 'N/A'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showPendingSubTabs && (
            <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30">
              <Button
                size="sm"
                variant={pendingViewTab === 'orders' ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => setPendingViewTab('orders')}
              >
                Pending Orders
              </Button>
              <Button
                size="sm"
                variant={pendingViewTab === 'suggestions' ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => setPendingViewTab('suggestions')}
              >
                Suggestions
              </Button>
            </div>
          )}

          {(pendingOrderCards.length > 0 && (!showPendingSubTabs || pendingViewTab === 'orders')) && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Pending Materials</h4>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                {pendingOrderCards.map((storeOrder) => {
                const storeId = storeOrder.storeId;
                const storeName = storeOrder.storeName || materialsByStore[storeId]?.name || 'Store';
                const isLegacyCard = storeOrder.orderId.startsWith('legacy-');
                const paymentRecord = isLegacyCard
                  ? (job.materialPayments?.find(payment => payment.orderId === storeOrder.orderId)
                      || job.materialPayments?.find(payment => !payment.orderId && payment.supplierId === storeId))
                  : job.materialPayments?.find(payment => payment.orderId === storeOrder.orderId);
                const isPaid = !!storeOrder.payment?.materialsPaid || paymentRecord?.status === 'paid';

                return (
                  <PendingMaterialOrderCard
                    key={storeOrder.orderId}
                    job={job}
                    storeOrder={storeOrder}
                    storeName={storeName}
                    isPaid={isPaid}
                    showSuggestedOriginBadge={!!storeOrder.sourceUserSuggestionId}
                    onPurchase={() => openPurchaseFlow(storeId, storeOrder.orderId)}
                    onDeleteMaterial={onDeleteMaterial}
                    purchaseButtonLabel={`Purchase From ${storeName}`}
                  />
                );
              })}
              </div>
            </div>
          )}

          {(hasPendingSuggestionItems && (!showPendingSubTabs || pendingViewTab === 'suggestions')) && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Suggested Materials</h4>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                {suggestionsForDisplay.map((suggestion) => {
                  if (suggestion.status === 'pending') {
                    const storeName = suggestion.suggested.supplierName || 'Store';
                    const lineTotal = suggestion.suggested.qty * suggestion.suggested.unitPrice;
                    return (
                      <div key={suggestion.id} className={cn('p-4 border rounded-lg', 'border-border')}>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Store className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium flex items-center gap-2 flex-wrap">
                                <span className="truncate">{storeName}</span>
                                <Badge variant="secondary" className="text-[10px]">
                                  Suggested
                                </Badge>
                              </p>
                              <p className="text-sm text-muted-foreground">1 item</p>
                            </div>
                          </div>
                          <div className="text-left sm:text-right space-y-1 w-full sm:w-auto">
                            <p className="font-bold">{formatCurrency(lineTotal, { decimals: 2 })}</p>
                            <Badge variant="secondary">Waiting for provider approval</Badge>
                          </div>
                        </div>
                        {suggestion.message && (
                          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                            {suggestion.message}
                          </p>
                        )}
                        <div className="mt-3 pt-3 border-t border-border space-y-2">
                          <div className="flex justify-between items-center text-sm gap-2">
                            <span className="text-muted-foreground">
                              {suggestion.suggested.name} × {suggestion.suggested.qty}
                            </span>
                            <span className="shrink-0">{formatCurrency(lineTotal, { decimals: 2 })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const acceptedOrder = getOrderForAcceptedSuggestion(suggestion);
                  if (!acceptedOrder) return null;
                  const storeId = acceptedOrder.storeId;
                  const storeName = acceptedOrder.storeName || materialsByStore[storeId]?.name || 'Store';
                  const isLegacyCard = acceptedOrder.orderId.startsWith('legacy-');
                  const paymentRecord = isLegacyCard
                    ? (job.materialPayments?.find(payment => payment.orderId === acceptedOrder.orderId)
                        || job.materialPayments?.find(payment => !payment.orderId && payment.supplierId === storeId))
                    : job.materialPayments?.find(payment => payment.orderId === acceptedOrder.orderId);
                  const isPaid = !!acceptedOrder.payment?.materialsPaid || paymentRecord?.status === 'paid';

                  return (
                    <div key={suggestion.id} className="space-y-2">
                      {suggestion.message && (
                        <p className="text-xs text-muted-foreground px-1">{suggestion.message}</p>
                      )}
                      <PendingMaterialOrderCard
                        job={job}
                        storeOrder={acceptedOrder}
                        storeName={storeName}
                        isPaid={isPaid}
                        showSuggestedOriginBadge
                        onPurchase={() => openPurchaseFlow(acceptedOrder.storeId, acceptedOrder.orderId)}
                        onDeleteMaterial={onDeleteMaterial}
                        purchaseButtonLabel="Purchase Suggested Material"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
            </RadioGroup>

            {selectedDeliveryType === 'PROVIDER' && (
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
                selectedDeliveryType === 'PROVIDER' && !selectedProviderId
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

            {/* Delivery Selection (if no store delivery) */}
            {selectedStore && !selectedStore.hasDelivery && (
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

                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="PROVIDER" id="purchase-provider" />
                      <Label htmlFor="purchase-provider" className="cursor-pointer flex-1">
                        <p className="font-medium">Request a delivery provider</p>
                        <p className="text-sm text-muted-foreground">Choose from nearby delivery providers</p>
                      </Label>
                    </div>
                  </div>
                </RadioGroup>

                {selectedDeliveryType === 'PROVIDER' && (
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
                  disabled={selectedDeliveryType === 'PROVIDER' && !selectedProviderId}
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
