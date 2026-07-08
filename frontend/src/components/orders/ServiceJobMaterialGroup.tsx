import { useState } from 'react';
import { Briefcase, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { OrderCard } from '@/components/orders/OrderCard';
import { ServiceJobMaterialGroup as ServiceJobMaterialGroupModel } from '@/lib/groupServiceMaterialOrders';
import { formatCurrency } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';

interface ServiceJobMaterialGroupProps {
  group: ServiceJobMaterialGroupModel;
  onOrderClick: (orderId: string) => void;
}

export function ServiceJobMaterialGroup({ group, onOrderClick }: ServiceJobMaterialGroupProps) {
  const { jobTitle, providerName, orders, orderCount, totalAmount } = group;
  const isMultiOrder = orderCount > 1;
  const [open, setOpen] = useState(false);

  const displayTitle = jobTitle?.trim() || 'Service job';

  if (!isMultiOrder) {
    const order = orders[0];
    return (
      <div className="card-elevated overflow-hidden transition-shadow hover:shadow-lg">
        <OrderCard
          order={order}
          variant="embedded"
          onClick={() => onOrderClick(order.id)}
        />
      </div>
    );
  }

  return (
    <div className="card-elevated overflow-hidden transition-shadow hover:shadow-lg">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50"
            aria-expanded={open}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Briefcase className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <p className="font-medium">{displayTitle}</p>
                <Badge variant="secondary" className="text-xs">
                  {orderCount} orders
                </Badge>
              </div>
              {providerName ? (
                <p className="text-xs text-muted-foreground">Provider: {providerName}</p>
              ) : null}
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <p className="font-bold">{formatCurrency(totalAmount, { decimals: 2 })}</p>
              <p className="text-xs text-muted-foreground">Combined total</p>
            </div>
            <ChevronDown
              className={cn(
                'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=closed]:animate-none">
          <div className="divide-y divide-border border-t border-border">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                variant="embedded"
                hideServiceContext
                onClick={() => onOrderClick(order.id)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
