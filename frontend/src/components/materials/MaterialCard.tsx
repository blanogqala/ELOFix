import { useState, type ReactNode } from 'react';
import { ChevronDown, ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  /**
   * Paid cards only: compact summary (items + subtotal + optional deliveryLocation),
   * with meta/footer/actions behind “More details”.
   */
  collapsible?: boolean;
  /** Primary pickup or delivery location — shown in the summary when collapsible. */
  deliveryLocation?: ReactNode;
  defaultExpanded?: boolean;
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
  collapsible = false,
  deliveryLocation,
  defaultExpanded = false,
}: MaterialCardProps) {
  const isPaid = status === 'paid';
  const isCollapsiblePaid = collapsible && isPaid;
  const [detailsOpen, setDetailsOpen] = useState(defaultExpanded);

  return (
    <div
      className={cn(
        'rounded-lg border p-4 flex flex-col h-full min-w-0 shadow-sm transition-shadow',
        isPaid ? 'border-green-500/60 bg-gradient-to-b from-green-500/[0.06] to-transparent' : 'border-primary/60 bg-background',
        status === 'draft' && 'border-muted-foreground/30 bg-muted/20',
        className
      )}
    >
      <div className={cn('flex flex-col gap-2 flex-1 min-w-0', contentClassName)}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            <span className="font-semibold truncate text-[15px] leading-tight">{supplierName}</span>
          </div>
          <Badge
            variant={status === 'draft' ? 'outline' : 'default'}
            className={cn('shrink-0', status !== 'draft' && statusBadgeClass(status))}
          >
            {STATUS_LABEL[status]}
          </Badge>
        </div>

        {!isCollapsiblePaid && meta}

        {isCollapsiblePaid && deliveryLocation ? (
          <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5 text-sm leading-snug text-foreground [&_svg]:shrink-0">
            {deliveryLocation}
          </div>
        ) : null}

        <div className="space-y-1 text-sm min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Items</p>
          {items.map((item) => (
            <div key={item.rowKey} className="flex justify-between gap-3 min-w-0 text-[13px] sm:text-sm">
              <span className="min-w-0 break-words text-foreground/95">
                {item.name} × {item.qty}
              </span>
              <span className="tabular-nums shrink-0 font-medium">{formatCurrency(item.lineTotal, { decimals: 2 })}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-border/80 mt-1 pt-2.5 flex justify-between items-baseline gap-2 text-sm font-semibold">
          <span className="text-muted-foreground font-medium">Subtotal</span>
          <span className="tabular-nums text-base">{formatCurrency(subtotal, { decimals: 2 })}</span>
        </div>

        {isCollapsiblePaid ? (
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 w-full gap-2 border-dashed border-border/90 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                aria-expanded={detailsOpen}
              >
                {detailsOpen ? 'Show less' : 'More details'}
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 opacity-70 transition-transform duration-200', detailsOpen && 'rotate-180')}
                  aria-hidden
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3 border-t border-border/70 pt-3 data-[state=closed]:animate-none">
              {meta}
              {footer}
              {actions ? <div className="flex flex-wrap gap-2 justify-end pt-1">{actions}</div> : null}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <>
            {footer}
            {actions ? <div className="mt-3 flex flex-wrap gap-2 justify-end">{actions}</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
