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
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Package className="h-6 w-6 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
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
        <div className="text-right shrink-0 hidden sm:block">
          <p className="font-bold">${order.total.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="ml-16 space-y-1 text-sm text-muted-foreground">
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

