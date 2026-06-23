import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { RefundSummaryLine } from '@/components/payments/RefundSummaryLine';

export interface OrderCardViewModel {
  id: string;
  storeName: string;
  /** Set when order is linked to a service job (material-orders from DB). */
  jobId?: string | null;
  jobTitle?: string | null;
  providerName?: string | null;
  itemsCount: number;
  total: number;
  deliveryFee?: number;
  deliveryTypeLabel: string;
  deliveryStatusLabel: string;
  fulfillmentStatus?: string;
  fulfillmentStatusLabel?: string;
  deliveryStatusClassName: string;
  createdAt: string;
  paymentStatus?: string;
  refundStatus?: string;
  refundAmount?: number;
  isRefunded?: boolean;
}

interface OrderCardProps {
  order: OrderCardViewModel;
  onClick?: () => void;
}

export function OrderCard({ order, onClick }: OrderCardProps) {
  const isService = Boolean(order.jobId);
  const isRefunded = Boolean(order.isRefunded || (order.refundAmount != null && order.refundAmount > 0));
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-sm hover:bg-muted/40 transition-colors cursor-pointer',
        'flex flex-col gap-2',
        isRefunded && 'border-destructive/30 bg-destructive/[0.03]'
      )}
      onClick={onClick}
      role="presentation"
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 sm:h-12 sm:w-12">
          <Package className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-medium">{order.storeName}</p>
            {order.fulfillmentStatusLabel ? (
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs',
                  isRefunded && 'bg-destructive/10 text-destructive border-destructive/30'
                )}
              >
                {isRefunded ? 'Cancelled · Refunded' : order.fulfillmentStatusLabel}
              </Badge>
            ) : (
              <Badge className={order.deliveryStatusClassName}>{order.deliveryStatusLabel}</Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {order.deliveryTypeLabel}
            </Badge>
          </div>
          {isService && (order.jobTitle || order.providerName) && (
            <p className="text-xs text-muted-foreground mb-1">
              {order.jobTitle ? <span className="font-medium text-foreground">{order.jobTitle}</span> : null}
              {order.jobTitle && order.providerName ? ' · ' : null}
              {order.providerName ? <span>Provider: {order.providerName}</span> : null}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {order.itemsCount} items • Order #{order.id.slice(-6)}
          </p>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <p className={cn('font-bold', isRefunded && 'text-muted-foreground line-through')}>
            {formatCurrency(order.total, { decimals: 2 })}
          </p>
          {isRefunded && order.refundAmount != null && order.refundAmount > 0 && (
            <RefundSummaryLine
              refundAmount={order.refundAmount}
              refundStatus={order.refundStatus || 'processed'}
              variant="inline"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="mt-1 flex justify-between text-sm font-semibold sm:hidden">
        <span className="text-muted-foreground">Total</span>
        <span>{formatCurrency(order.total, { decimals: 2 })}</span>
      </div>

      <div className="mt-2 space-y-1 text-sm text-muted-foreground sm:ml-16 sm:mt-0">
        {order.deliveryFee && order.deliveryFee > 0 && (
          <div className="flex justify-between">
            <span>Delivery Fee</span>
            <span>{formatCurrency(order.deliveryFee, { decimals: 2 })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
