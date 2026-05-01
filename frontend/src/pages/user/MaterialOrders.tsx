import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAllMaterialOrdersForUser } from '@/lib/api/materialOrders';
import { Package, ShoppingCart } from 'lucide-react';
import { OrderCard, OrderCardViewModel } from '@/components/orders/OrderCard';
import { useMaterialOrderFulfillmentSocket } from '@/hooks/useMaterialOrderFulfillmentSocket';

function OrdersPanel(props: {
  isLoading: boolean;
  orders: OrderCardViewModel[];
  emptyTitle: string;
  emptyHint: string;
  emptyActionLabel: string;
  onEmptyAction: () => void;
  onOrderClick: (id: string) => void;
}) {
  const { isLoading, orders, emptyTitle, emptyHint, emptyActionLabel, onEmptyAction, onOrderClick } = props;
  return (
    <div className="card-elevated overflow-hidden p-4 md:p-6">
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-48 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : orders.length > 0 ? (
        <div className="grid gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onClick={() => onOrderClick(order.id)} />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">{emptyTitle}</h3>
          <p className="text-muted-foreground text-sm mb-4">{emptyHint}</p>
          <Button onClick={onEmptyAction}>{emptyActionLabel}</Button>
        </div>
      )}
    </div>
  );
}

export default function MaterialOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'service' | 'standalone'>('service');

  const uid = user?.id ?? '';
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['material-orders', 'user', uid],
    queryFn: () => getAllMaterialOrdersForUser(uid),
    enabled: Boolean(uid),
  });

  useMaterialOrderFulfillmentSocket({ userId: uid });

  const { serviceMaterials, standaloneMaterials } = useMemo(() => {
    const service = orders.filter((o) => o.jobId != null && String(o.jobId).trim() !== '');
    const standalone = orders.filter((o) => o.jobId == null || String(o.jobId).trim() === '');
    return { serviceMaterials: service, standaloneMaterials: standalone };
  }, [orders]);

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">My Material Orders</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Service-linked batches and standalone store orders — same supplier tracking everywhere
            </p>
          </div>
          <Button
            className="btn-accent h-10 w-full shrink-0 whitespace-nowrap sm:w-auto"
            onClick={() => navigate('/user/order-materials')}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'service' | 'standalone')} className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="service">Service materials ({serviceMaterials.length})</TabsTrigger>
            <TabsTrigger value="standalone">Standalone orders ({standaloneMaterials.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="service" className="mt-0">
            <OrdersPanel
              isLoading={isLoading}
              orders={serviceMaterials}
              emptyTitle="No service material orders"
              emptyHint="When you pay for materials on a job, they appear here with full tracking."
              emptyActionLabel="View jobs"
              onEmptyAction={() => navigate('/user/jobs')}
              onOrderClick={(id) => navigate(`/user/orders/${id}`)}
            />
          </TabsContent>
          <TabsContent value="standalone" className="mt-0">
            <OrdersPanel
              isLoading={isLoading}
              orders={standaloneMaterials}
              emptyTitle="No standalone orders"
              emptyHint="Order hardware from stores — deliveries appear here."
              emptyActionLabel="Order materials"
              onEmptyAction={() => navigate('/user/order-materials')}
              onOrderClick={(id) => navigate(`/user/orders/${id}`)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
