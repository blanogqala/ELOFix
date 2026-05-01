import type { ReactNode } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';

export type MaterialCardStatus = 'draft' | 'pending' | 'paid' | 'suggested' | 'approved';

export interface MaterialCardItemRow {
  rowKey: string;
  name: string;
  qty: number;
  lineTotal: number;
}

const STATUS_LABEL: Record<MaterialCardStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  paid: 'Paid',
  suggested: 'Suggested',
  approved: 'Approved',
};

function statusBadgeClass(status: MaterialCardStatus): string {
  switch (status) {
    case 'paid':
      return 'bg-green-700 text-white hover:bg-green-700';
    case 'pending':
      return 'bg-amber-500/90 text-amber-950 hover:bg-amber-500 border-amber-600/80';
    case 'draft':
      return 'text-muted-foreground border-muted-foreground/40';
    case 'suggested':
      return 'bg-blue-600/90 text-white hover:bg-blue-600';
    case 'approved':
      return 'bg-secondary text-secondary-foreground hover:bg-secondary';
    default:
      return '';
  }
}

export interface MaterialCardProps {
  supplierName: string;
  items: MaterialCardItemRow[];
  subtotal: number;
  status: MaterialCardStatus;
  meta?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function MaterialCard({
  supplierName,
  items,
  subtotal,
  status,
  meta,
  footer,
  actions,
  className,
  contentClassName,
}: MaterialCardProps) {
  const isPaid = status === 'paid';

  return (
    <div
      className={cn(
        'rounded-lg border p-4 flex flex-col h-full',
        isPaid ? 'border-green-500/60 bg-green-500/5' : 'border-primary/60 bg-background',
        status === 'draft' && 'border-muted-foreground/30 bg-muted/20',
        className
      )}
    >
      <div className={cn('flex flex-col gap-2 flex-1', contentClassName)}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{supplierName}</span>
          </div>
          <Badge
            variant={status === 'draft' ? 'outline' : 'default'}
            className={cn(status !== 'draft' && statusBadgeClass(status))}
          >
            {STATUS_LABEL[status]}
          </Badge>
        </div>

        {meta}

        <div className="space-y-1 text-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Items</p>
          {items.map((item) => (
            <div key={item.rowKey} className="flex justify-between gap-2">
              <span>
                {item.name} × {item.qty}
              </span>
              <span>{formatCurrency(item.lineTotal, { decimals: 2 })}</span>
            </div>
          ))}
        </div>

        <div className="border-t mt-2 pt-2 flex justify-between text-sm font-semibold">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal, { decimals: 2 })}</span>
        </div>

        {footer}

        {actions && <div className="mt-3 flex flex-wrap gap-2 justify-end">{actions}</div>}
      </div>
    </div>
  );
}
