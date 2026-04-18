import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { getAllMaterialOrdersForUser } from '@/lib/api/materialOrders';
import { Package, ShoppingCart } from 'lucide-react';
import { OrderCard, OrderCardViewModel } from '@/components/orders/OrderCard';

export default function MaterialOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderCardViewModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getAllMaterialOrdersForUser(user.id);
      setOrders(data);
    } catch { /* empty */ }
    finally { setIsLoading(false); }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadOrders();
    }
  }, [user, loadOrders]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Material Orders</h1>
            <p className="text-muted-foreground">Track your standalone material purchases</p>
          </div>
          <Button className="btn-accent" onClick={() => navigate('/user/order-materials')}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>

        <div className="card-elevated">
          {isLoading ? (
            <div className="p-6 space-y-4">
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
            <div className="divide-y divide-border">
              {orders.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onClick={() => navigate(`/user/orders/${order.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Order materials from hardware stores</p>
              <Button onClick={() => navigate('/user/order-materials')}>Order Materials</Button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
