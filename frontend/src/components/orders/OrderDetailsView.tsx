import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Truck, Store, FileText, CreditCard, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';

export type NormalizedOrderDeliveryType = 'SELF' | 'STORE' | 'PROVIDER';

export type NormalizedDeliveryState =
  | 'SelfCollect'
  | 'PendingApproval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'InProgress'
  | 'Processing'
  | 'OnTheWay'
  | 'Delivered';

export interface NormalizedOrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface NormalizedOrder {
  id: string;
  storeName: string;
  items: NormalizedOrderItem[];
  deliveryType: NormalizedOrderDeliveryType;
  deliveryFee: number;
  totalPaid: number;
  createdAt: string;
  deliveryStatus: 'processing' | 'out_for_delivery' | 'delivered';
  deliveryState?: NormalizedDeliveryState;
  deliveryPaid?: boolean;
  materialsPaid?: boolean;
  invoiceId: string;
  deliveryInvoiceId?: string;
  providerName?: string;
  providerVehicle?: string;
  providerContact?: string;
  estimatedArrival?: string;
  jobId?: string;
  storeId?: string;
}

interface OrderDetailsViewProps {
  order: NormalizedOrder;
  onStatusChange?: (status: NormalizedOrder['deliveryStatus']) => void;
  onCancelDelivery?: () => void;
  onChangeDelivery?: () => void;
  onChooseDelivery?: () => void;
  onPayDelivery?: () => void;
  onSimulateApproval?: () => void;
  onSimulateRejection?: () => void;
  onViewMaterialInvoice?: (invoiceId: string) => void;
  onViewDeliveryInvoice?: (invoiceId: string) => void;
}

const STATUS_STEPS: NormalizedOrder['deliveryStatus'][] = [
  'processing',
  'out_for_delivery',
  'delivered',
];

const DELIVERY_STATE_BADGES: Record<
  NormalizedDeliveryState,
  { label: string; className: string }
> = {
  SelfCollect: { label: 'Self-collect', className: 'bg-muted text-muted-foreground' },
  PendingApproval: { label: 'Waiting for approval', className: 'bg-warning/20 text-warning' },
  Approved: { label: 'Approved', className: 'bg-primary/20 text-primary' },
  Rejected: { label: 'Rejected', className: 'bg-destructive/20 text-destructive' },
  Cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  InProgress: { label: 'In progress', className: 'bg-primary/20 text-primary' },
  Processing: { label: 'Processing', className: 'bg-warning/20 text-warning' },
  OnTheWay: { label: 'On the way', className: 'bg-primary/20 text-primary' },
  Delivered: { label: 'Delivered', className: 'bg-success/20 text-success' },
};

export function OrderDetailsView({
  order,
  onCancelDelivery,
  onChangeDelivery,
  onChooseDelivery,
  onPayDelivery,
  onSimulateApproval,
  onSimulateRejection,
  onViewMaterialInvoice,
  onViewDeliveryInvoice,
}: OrderDetailsViewProps) {
  const currentStepIndex = STATUS_STEPS.indexOf(order.deliveryStatus);
  const progressValue = ((currentStepIndex + 1) / STATUS_STEPS.length) * 100;

  const deliveryTypeLabel =
    order.deliveryType === 'SELF'
      ? 'Self-collection'
      : order.deliveryType === 'STORE'
      ? 'Store Delivery'
      : 'Delivery Provider';

  const deliveryState = order.deliveryState || 'Processing';
  const stateBadge = DELIVERY_STATE_BADGES[deliveryState] || DELIVERY_STATE_BADGES.Processing;
  const showTracking = order.deliveryType !== 'SELF' && order.deliveryPaid;
  const isPendingApproval = deliveryState === 'PendingApproval';
  const isApproved = deliveryState === 'Approved' && !order.deliveryPaid;
  const isRejected = deliveryState === 'Rejected';
  const isCancelled = deliveryState === 'Cancelled';
  const noDeliverySelected = isCancelled || !order.deliveryType;
  const isInProgressOrDelivered = deliveryState === 'InProgress' || deliveryState === 'Delivered' || deliveryState === 'OnTheWay';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <span>Order Summary</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-medium">{order.storeName}</p>
              <p className="text-sm text-muted-foreground">
                Order #{order.id.slice(-8)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{deliveryTypeLabel}</Badge>
              <Badge className={stateBadge.className}>{stateBadge.label}</Badge>
              {order.deliveryStatus && (
                <Badge
                  className={cn(
                    order.deliveryStatus === 'delivered'
                      ? 'bg-success/20 text-success'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {order.deliveryStatus === 'processing' && 'Processing'}
                  {order.deliveryStatus === 'out_for_delivery' && 'On the Way'}
                  {order.deliveryStatus === 'delivered' && 'Delivered'}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {order.items.map(item => (
              <div
                key={item.productId}
                className="flex justify-between text-sm text-muted-foreground"
              >
                <span>
                  {item.name} × {item.qty}
                </span>
                <span>${(item.qty * item.unitPrice).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Material Total</span>
                <span>
                  {formatCurrency(
                    order.items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0),
                    { decimals: 2 }
                  )}
                </span>
              </div>
            </div>
          </div>

          {onViewMaterialInvoice && (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => onViewMaterialInvoice(order.invoiceId)}
            >
              <FileText className="h-4 w-4 mr-2" />
              View Invoice
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <span>Delivery</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {noDeliverySelected && (
            <div className="space-y-3 p-4 bg-muted/50 border border-border rounded-lg">
              <p className="text-sm text-muted-foreground">No delivery selected.</p>
              <Button size="sm" className="btn-accent" onClick={onChooseDelivery}>
                <Truck className="h-3 w-3 mr-1" />
                Choose Delivery Option
              </Button>
            </div>
          )}

          {!noDeliverySelected && isPendingApproval && (
            <div className="space-y-3 p-4 bg-warning/10 border border-warning/30 rounded-lg">
              <Badge className={stateBadge.className}>Pending Approval</Badge>
              <p className="text-sm font-medium">Waiting for delivery approval</p>
              {order.deliveryType === 'PROVIDER' && (order.providerName || order.providerVehicle || order.deliveryFee > 0) && (
                <div className="text-sm text-muted-foreground space-y-1">
                  {order.providerName && <p>Driver: {order.providerName}</p>}
                  {order.providerVehicle && <p>Vehicle: {order.providerVehicle}</p>}
                  {order.deliveryFee > 0 && <p>Delivery price: ${order.deliveryFee.toFixed(2)}</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onCancelDelivery}>
                  <XCircle className="h-3 w-3 mr-1" />
                  Cancel Delivery Request
                </Button>
                <Button size="sm" className="btn-accent" onClick={onChangeDelivery}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Change Delivery Provider
                </Button>
                {onSimulateApproval && (
                  <Button size="sm" variant="secondary" onClick={onSimulateApproval}>
                    Simulate Driver Approval
                  </Button>
                )}
                {onSimulateRejection && (
                  <Button size="sm" variant="secondary" onClick={onSimulateRejection}>
                    Simulate Driver Rejection
                  </Button>
                )}
              </div>
            </div>
          )}

          {!noDeliverySelected && isApproved && order.deliveryFee > 0 && (
            <div className="space-y-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div>
                <p className="font-medium">Delivery Information</p>
                <p className="text-sm text-muted-foreground">
                  Delivery approved — pay {formatCurrency(order.deliveryFee, { decimals: 2 })} to start delivery
                </p>
                {order.deliveryType === 'PROVIDER' && (order.providerName || order.providerVehicle) && (
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {order.providerName && <p>Driver: {order.providerName}</p>}
                    {order.providerVehicle && <p>Vehicle: {order.providerVehicle}</p>}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="btn-accent" onClick={onPayDelivery}>
                  <CreditCard className="h-3 w-3 mr-1" />
                  Pay Delivery
                </Button>
                <Button size="sm" variant="outline" onClick={onChangeDelivery}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Change Delivery Option
                </Button>
                <Button size="sm" variant="outline" onClick={onCancelDelivery}>
                  <XCircle className="h-3 w-3 mr-1" />
                  Cancel Delivery
                </Button>
              </div>
            </div>
          )}

          {!noDeliverySelected && isRejected && (
            <div className="space-y-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <Badge className={stateBadge.className}>Rejected</Badge>
              <p className="text-sm font-medium">Delivery request was rejected</p>
              <Button size="sm" className="btn-accent" onClick={onChooseDelivery}>
                <Truck className="h-3 w-3 mr-1" />
                Choose Delivery Option
              </Button>
            </div>
          )}

          {!noDeliverySelected && deliveryState === 'SelfCollect' && (
            <p className="text-sm text-muted-foreground">
              Collect your items at the store when ready.
            </p>
          )}

          {!noDeliverySelected && (showTracking || isInProgressOrDelivered) && (
            <>
              {order.deliveryInvoiceId && onViewDeliveryInvoice && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-3"
                  onClick={() => onViewDeliveryInvoice(order.deliveryInvoiceId!)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Delivery Invoice
                </Button>
              )}
              {showTracking ? (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Status</p>
                    <Progress value={progressValue} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Processing</span>
                      <span>Out for Pickup</span>
                      <span>Delivered</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="rounded-lg border border-dashed border-border bg-muted/40 h-40 flex items-center justify-center">
                      <p className="text-xs text-muted-foreground text-center max-w-xs">
                        Live delivery map will show your driver moving from the store to
                        your location. (Mock map for demo)
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Delivery is in progress or completed. Contact support if you need assistance.
                </p>
              )}
            </>
          )}

          {!noDeliverySelected && !isPendingApproval && !isApproved && !isRejected && deliveryState !== 'SelfCollect' && !showTracking && !isInProgressOrDelivered && (
            <p className="text-sm text-muted-foreground">
              Delivery details will appear here once your order is processed.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

