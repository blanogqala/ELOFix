import { formatCurrency } from '@/lib/formatCurrency';
import { resolveOrderFinance, type OrderFinanceBreakdown } from '@/lib/orderFinance';
import { cn } from '@/lib/utils';

type Props = {
  finance?: OrderFinanceBreakdown;
  materialsSubtotal?: number;
  deliveryFee?: number;
  deliveryType?: string;
  platformCommission?: number;
  supplierEarning?: number;
  deliveryPaid?: boolean;
  materialsPaid?: boolean;
  items?: Array<{ qty: number; unitPrice: number }>;
  compact?: boolean;
  showSupplierNet?: boolean;
  deliveryNote?: string;
  className?: string;
};

export function OrderFinanceBreakdown({
  finance: financeProp,
  compact = false,
  showSupplierNet = true,
  deliveryNote,
  className,
  ...orderParts
}: Props) {
  const finance =
    financeProp ??
    resolveOrderFinance({
      ...orderParts,
      payment: {
        deliveryPaid: orderParts.deliveryPaid,
        materialsPaid: orderParts.materialsPaid,
      },
    });

  const showDelivery =
    finance.deliveryFee > 0 &&
    (finance.deliveryType === 'STORE_DELIVERY' ||
      finance.commissionBasis === 'materials_plus_delivery' ||
      String(orderParts.deliveryType || '').toUpperCase().includes('STORE'));

  const deliveryLabel =
    finance.deliveryPaid === false && finance.commissionBasis === 'materials_plus_delivery'
      ? 'Delivery (pay after branch approval)'
      : 'Delivery';

  return (
    <div className={cn('space-y-1 text-sm', className)}>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Materials</span>
        <span className="tabular-nums font-medium">{formatCurrency(finance.materialsSubtotal, { decimals: 2 })}</span>
      </div>
      {showDelivery ? (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{deliveryLabel}</span>
          <span className="tabular-nums">{formatCurrency(finance.deliveryFee, { decimals: 2 })}</span>
        </div>
      ) : null}
      {finance.commissionBasis === 'materials_plus_delivery' && showDelivery ? (
        <>
          <div className="flex justify-between gap-4 border-t border-border pt-1 font-medium">
            <span>Order total</span>
            <span className="tabular-nums">{formatCurrency(finance.orderGross, { decimals: 2 })}</span>
          </div>
          {!compact ? (
            <p className="text-xs text-muted-foreground">
              Materials + delivery combined. Platform fee is 7% of this total.
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex justify-between gap-4 border-t border-border pt-1 font-medium">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(finance.materialsSubtotal, { decimals: 2 })}</span>
        </div>
      )}
      {showSupplierNet && !compact ? (
        <>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>Platform fee (7%)</span>
            <span className="tabular-nums">− {formatCurrency(finance.platformCommission, { decimals: 2 })}</span>
          </div>
          <div className="flex justify-between gap-4 font-medium text-foreground">
            <span>Supplier receives</span>
            <span className="tabular-nums">{formatCurrency(finance.supplierNet, { decimals: 2 })}</span>
          </div>
        </>
      ) : null}
      {deliveryNote ? <p className="text-xs text-muted-foreground pt-1">{deliveryNote}</p> : null}
    </div>
  );
}
