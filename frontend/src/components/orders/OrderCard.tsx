import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OrderCardViewModel {
  id: string;
  storeName: string;
  itemsCount: number;
  total: number;
  deliveryFee?: number;
  deliveryTypeLabel: string;
  deliveryStatusLabel: string;
  deliveryStatusClassName: string;
  createdAt: string;
}

interface OrderCardProps {
  order: OrderCardViewModel;
  onClick?: () => void;
}

export function OrderCard({ order, onClick }: OrderCardProps) {
  return (
    <div
      className={cn(
        'p-4 hover:bg-muted/50 transition-colors cursor-pointer',
        'flex flex-col gap-2'
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 sm:h-12 sm:w-12">
          <Package className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-medium">{order.storeName}</p>
            <Badge className={order.deliveryStatusClassName}>
              {order.deliveryStatusLabel}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {order.deliveryTypeLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {order.itemsCount} items • Order #{order.id.slice(-6)}
          </p>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <p className="font-bold">${order.total.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="mt-1 flex justify-between text-sm font-semibold sm:hidden">
        <span className="text-muted-foreground">Total</span>
        <span>${order.total.toFixed(2)}</span>
      </div>

      <div className="mt-2 space-y-1 text-sm text-muted-foreground sm:ml-16 sm:mt-0">
        {order.deliveryFee && order.deliveryFee > 0 && (
          <div className="flex justify-between">
            <span>Delivery Fee</span>
            <span>${order.deliveryFee.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

