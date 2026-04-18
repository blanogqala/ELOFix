import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { OrderDetailsView, NormalizedOrder, NormalizedDeliveryState } from '@/components/orders/OrderDetailsView';
import { DeliveryOptionChooser, DeliveryOptionSelection } from '@/components/orders/DeliveryOptionChooser';
import { getSuppliers } from '@/lib/api/suppliers';
import {
  getMaterialOrderById,
  updateMaterialOrderDelivery,
  approveMaterialOrderDelivery,
  rejectMaterialOrderDelivery,
  payMaterialOrderDelivery,
} from '@/lib/api/materialOrders';
import {
  getJobsByUser,
  updateStoreOrderDelivery,
  approveStoreOrderDelivery,
  rejectStoreOrderDelivery,
  payStoreOrderDelivery,
} from '@/lib/api/jobs';
import { getSavedCards, getInvoiceById } from '@/lib/api/payments';
import { DeliveryProvider, SavedCard } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatCurrency';
import { getDeliveryProviders } from '@/lib/api/specials';

type RouteParams = {
  orderId?: string;
  jobId?: string;
  storeOrderId?: string;
};

export default function OrderDetails() {
  const { user } = useAuth();
  const { orderId, jobId, storeOrderId } = useParams<RouteParams>();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [order, setOrder] = useState<NormalizedOrder | null>(null);
  const [jobContext, setJobContext] = useState<{ jobId: string; storeId: string } | null>(null);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [deliveryProviders, setDeliveryProviders] = useState<DeliveryProvider[]>([]);
  const [deliveryProvidersError, setDeliveryProvidersError] = useState<string | null>(null);
  const [deliveryChooserOpen, setDeliveryChooserOpen] = useState(false);
  const [storeHasDelivery, setStoreHasDelivery] = useState(false);
  const [storeDeliveryFee, setStoreDeliveryFee] = useState(0);

  useEffect(() => {
    if (!user) return;
    loadOrder();
    if (user) {
      getSavedCards(user.id).then(cards => setSavedCards(cards));
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

  const mapDeliveryStatus = (s: string): NormalizedOrder['deliveryStatus'] =>
    s === 'delivered' ? 'delivered' : s === 'out_for_delivery' ? 'out_for_delivery' : 'processing';

  const mapDeliveryState = (s: string): NormalizedDeliveryState =>
    (['SelfCollect', 'PendingApproval', 'Approved', 'Rejected', 'Cancelled', 'InProgress', 'Processing', 'OnTheWay', 'Delivered'].includes(s)
      ? (s as NormalizedDeliveryState)
      : 'Processing');

  const loadOrder = async () => {
    if (!user) return;
    const effectiveOrderId = orderId || storeOrderId;
    if (!effectiveOrderId) return;

    try {
      const found = await getMaterialOrderById(effectiveOrderId);
      if (found && found.userId === user.id) {
        const d = found.delivery;
        const p = found.payment;
        const deliveryState = mapDeliveryState(d?.status ?? (found.deliveryType === 'SELF' ? 'SelfCollect' : 'PendingApproval'));
        const provider = found.deliveryProviderId
          ? deliveryProviders.find(dp => dp.id === found.deliveryProviderId)
          : null;
        const normalized: NormalizedOrder = {
          id: found.id,
          storeName: found.storeName,
          storeId: found.storeId,
          items: found.items.map(i => ({ productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
          deliveryType: found.deliveryType === 'SELF' ? 'SELF' : found.deliveryType === 'STORE_DELIVERY' ? 'STORE' : 'PROVIDER',
          deliveryFee: found.deliveryFee,
          totalPaid: found.total,
          createdAt: found.createdAt,
          deliveryStatus: mapDeliveryStatus(found.deliveryStatus),
          deliveryState,
          deliveryPaid: p?.deliveryPaid ?? false,
          materialsPaid: p?.materialsPaid ?? true,
          invoiceId: found.invoiceId,
          deliveryInvoiceId: found.deliveryInvoiceId,
          providerName: provider?.name,
          providerVehicle: provider ? [provider.vehicleType, provider.numberPlate].filter(Boolean).join(' - ') : undefined,
        };
        setOrder(normalized);
        setJobContext(null);
        const suppliers = await getSuppliers();
        const supplier = suppliers.find(s => s.id === found.storeId);
        setStoreHasDelivery(supplier?.hasDelivery ?? false);
        setStoreDeliveryFee(supplier?.deliveryFee ?? 0);
        return;
      }

      const jobs = await getJobsByUser(user.id);
      for (const job of jobs) {
        if (!job.storeOrders) continue;
        const storeOrder = job.storeOrders.find(so => so.orderId === effectiveOrderId);
        if (!storeOrder) continue;

        const d = storeOrder.delivery;
        const p = storeOrder.payment;
        const deliveryState = mapDeliveryState(d?.status ?? storeOrder.deliveryStatus);
        const materialsTotal = storeOrder.items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
        const provider = storeOrder.deliveryProviderId
          ? deliveryProviders.find(dp => dp.id === storeOrder.deliveryProviderId)
          : null;
        const normalized: NormalizedOrder = {
          id: storeOrder.orderId,
          storeName: storeOrder.storeName || job.materials.find(m => m.supplierId === storeOrder.storeId)?.supplierName || 'Store',
          items: storeOrder.items.map(i => ({ productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
          deliveryType: storeOrder.deliveryType === 'STORE' ? 'STORE' : storeOrder.deliveryType,
          deliveryFee: storeOrder.deliveryFee,
          totalPaid: materialsTotal + (p?.deliveryPaid ? (storeOrder.deliveryFee || 0) : 0),
          createdAt: storeOrder.createdAt,
          deliveryStatus:
            storeOrder.deliveryStatus === 'Delivered' ? 'delivered'
            : storeOrder.deliveryStatus === 'OnTheWay' || storeOrder.deliveryStatus === 'InProgress' ? 'out_for_delivery'
            : 'processing',
          deliveryState,
          deliveryPaid: p?.deliveryPaid ?? false,
          materialsPaid: p?.materialsPaid ?? true,
          invoiceId: storeOrder.invoiceId,
          deliveryInvoiceId: storeOrder.deliveryInvoiceId,
          providerName: provider?.name,
          providerVehicle: provider ? [provider.vehicleType, provider.numberPlate].filter(Boolean).join(' - ') : undefined,
          jobId: job.id,
          storeId: storeOrder.storeId,
        };
        setOrder(normalized);
        setJobContext({ jobId: job.id, storeId: storeOrder.storeId });
        const suppliers = await getSuppliers();
        const supplier = suppliers.find(s => s.id === storeOrder.storeId);
        setStoreHasDelivery(supplier?.hasDelivery ?? false);
        setStoreDeliveryFee(supplier?.deliveryFee ?? 0);
        return;
      }
    } catch {
      // noop
    }
  };

  const isStandalone = !jobContext;
  const effectiveOrderId = orderId || storeOrderId;

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
    } catch {
      toast({ title: 'Error', description: 'Failed to cancel delivery.', variant: 'destructive' });
    }
  };

  const handleSimulateApproval = async () => {
    if (!order || !effectiveOrderId) return;
    try {
      if (jobContext) {
        await approveStoreOrderDelivery(jobContext.jobId, jobContext.storeId);
      } else {
        await approveMaterialOrderDelivery(effectiveOrderId);
      }
      toast({ title: 'Delivery approved', description: 'You can now pay for delivery.' });
      loadOrder();
    } catch {
      toast({ title: 'Error', description: 'Failed to approve.', variant: 'destructive' });
    }
  };

  const handleSimulateRejection = async () => {
    if (!order || !effectiveOrderId) return;
    try {
      if (jobContext) {
        await rejectStoreOrderDelivery(jobContext.jobId, jobContext.storeId);
      } else {
        await rejectMaterialOrderDelivery(effectiveOrderId);
      }
      toast({ title: 'Delivery rejected', description: 'You can choose a new delivery provider.' });
      loadOrder();
    } catch {
      toast({ title: 'Error', description: 'Failed to reject.', variant: 'destructive' });
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
                <td>$${item.unitPrice.toFixed(2)}</td>
                <td>$${item.total.toFixed(2)}</td>
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
    const card = savedCards[0];
    const last4 = card?.last4 || '****';
    const fee = order.deliveryFee || 0;
    if (fee <= 0) return;
    try {
      if (jobContext) {
        await payStoreOrderDelivery(jobContext.jobId, jobContext.storeId, last4, fee);
      } else {
        await payMaterialOrderDelivery(effectiveOrderId, last4, fee);
      }
      toast({ title: 'Delivery paid', description: 'Delivery has been paid. Tracking will start soon.' });
      loadOrder();
    } catch {
      toast({ title: 'Error', description: 'Payment failed.', variant: 'destructive' });
    }
  };

  const handleChangeDelivery = () => {
    const isApprovedUnpaid = order?.deliveryState === 'Approved' && !order?.deliveryPaid;
    if (isApprovedUnpaid && !window.confirm('Change delivery option? Your current approval will be lost.')) return;
    setDeliveryChooserOpen(true);
  };

  const handleChooseDelivery = () => setDeliveryChooserOpen(true);

  const handleDeliveryOptionSelected = async (delivery: DeliveryOptionSelection) => {
    if (!order || !effectiveOrderId) return;
    try {
      const updates = {
        type: delivery.type,
        status: delivery.status as 'SelfCollect' | 'PendingApproval',
        fee: delivery.fee,
        providerId: delivery.providerId,
      };
      if (jobContext) {
        await updateStoreOrderDelivery(jobContext.jobId, jobContext.storeId, updates);
      } else {
        await updateMaterialOrderDelivery(effectiveOrderId, updates);
      }
      toast({ title: 'Delivery option updated', description: 'Your delivery preference has been saved.' });
      setDeliveryChooserOpen(false);
      loadOrder();
    } catch {
      toast({ title: 'Error', description: 'Failed to update delivery option.', variant: 'destructive' });
    }
  };

  const handleBack = () => {
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

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Order Details</h1>
            <p className="text-sm text-muted-foreground">
              Track your material delivery in real-time.
            </p>
          </div>
        </div>

        {order ? (
          <>
            <OrderDetailsView
              order={order}
              onCancelDelivery={
                order.deliveryState === 'PendingApproval' || (order.deliveryState === 'Approved' && !order.deliveryPaid)
                  ? handleCancelDelivery
                  : undefined
              }
              onChangeDelivery={
                order.deliveryState === 'PendingApproval' || order.deliveryState === 'Rejected' ||
                (order.deliveryState === 'Approved' && !order.deliveryPaid)
                  ? handleChangeDelivery
                  : undefined
              }
              onChooseDelivery={handleChooseDelivery}
              onPayDelivery={
                order.deliveryState === 'Approved' && !order.deliveryPaid && order.deliveryFee > 0
                  ? handlePayDelivery
                  : undefined
              }
              onSimulateApproval={
                order.deliveryState === 'PendingApproval' ? handleSimulateApproval : undefined
              }
              onSimulateRejection={
                order.deliveryState === 'PendingApproval' ? handleSimulateRejection : undefined
              }
              onViewMaterialInvoice={user ? handleViewInvoice : undefined}
              onViewDeliveryInvoice={user ? handleViewInvoice : undefined}
            />
            <DeliveryOptionChooser
              open={deliveryChooserOpen}
              onOpenChange={setDeliveryChooserOpen}
              storeName={order.storeName}
              storeId={order.storeId || ''}
              storeHasDelivery={storeHasDelivery}
              storeDeliveryFee={storeDeliveryFee}
              deliveryProviders={deliveryProviders}
              deliveryProvidersError={deliveryProvidersError}
              onSelect={handleDeliveryOptionSelected}
            />
          </>
        ) : (
          <div className="card-elevated p-8 text-center text-muted-foreground">
            Order not found.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

