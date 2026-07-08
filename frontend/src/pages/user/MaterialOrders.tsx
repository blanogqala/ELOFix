import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAllMaterialOrdersForUser } from '@/lib/api/materialOrders';
import { groupServiceMaterialOrdersByJob } from '@/lib/groupServiceMaterialOrders';
import { Package, ShoppingCart } from 'lucide-react';
import { OrderCard, OrderCardViewModel } from '@/components/orders/OrderCard';
import { ServiceJobMaterialGroup } from '@/components/orders/ServiceJobMaterialGroup';
import { useMaterialOrderFulfillmentSocket } from '@/hooks/useMaterialOrderFulfillmentSocket';

function LoadingSkeletons() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card-elevated p-6 animate-pulse">
          <div className="h-6 w-48 bg-muted rounded mb-4" />
          <div className="h-4 w-full bg-muted rounded mb-2" />
          <div className="h-4 w-2/3 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState(props: {
  title: string;
  hint: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const { title, hint, actionLabel, onAction } = props;
  return (
    <div className="card-elevated p-12 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Package className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="mb-4 text-sm text-muted-foreground">{hint}</p>
      <Button onClick={onAction}>{actionLabel}</Button>
    </div>
  );
}

function ServiceMaterialsList(props: {
  isLoading: boolean;
  orders: OrderCardViewModel[];
  onOrderClick: (id: string) => void;
  onEmptyAction: () => void;
}) {
  const { isLoading, orders, onOrderClick, onEmptyAction } = props;

  const groups = useMemo(() => groupServiceMaterialOrdersByJob(orders), [orders]);

  if (isLoading) return <LoadingSkeletons />;

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No service material orders"
        hint="When you pay for materials on a job, they appear here with full tracking."
        actionLabel="View jobs"
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <ServiceJobMaterialGroup key={group.jobId} group={group} onOrderClick={onOrderClick} />
      ))}
    </div>
  );
}

function StandaloneOrdersList(props: {
  isLoading: boolean;
  orders: OrderCardViewModel[];
  onOrderClick: (id: string) => void;
  onEmptyAction: () => void;
}) {
  const { isLoading, orders, onOrderClick, onEmptyAction } = props;

  if (isLoading) return <LoadingSkeletons />;

  if (orders.length === 0) {
    return (
      <EmptyState
        title="No standalone orders"
        hint="Order hardware from stores — deliveries appear here."
        actionLabel="Order materials"
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div
          key={order.id}
          className="card-elevated overflow-hidden transition-shadow hover:shadow-lg"
        >
          <OrderCard order={order} variant="embedded" onClick={() => onOrderClick(order.id)} />
        </div>
      ))}
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

  const handleOrderClick = (id: string) => navigate(`/user/material-orders/${id}`);

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
            <ServiceMaterialsList
              isLoading={isLoading}
              orders={serviceMaterials}
              onOrderClick={handleOrderClick}
              onEmptyAction={() => navigate('/user/jobs')}
            />
          </TabsContent>
          <TabsContent value="standalone" className="mt-0">
            <StandaloneOrdersList
              isLoading={isLoading}
              orders={standaloneMaterials}
              onOrderClick={handleOrderClick}
              onEmptyAction={() => navigate('/user/order-materials')}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
