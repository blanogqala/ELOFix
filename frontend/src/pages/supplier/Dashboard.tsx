import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getSupplierMe, getSupplierOrders } from '@/lib/api/supplierPortal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatCurrency';
import { ClipboardList, DollarSign, ArrowRight, ShoppingCart } from 'lucide-react';

export default function SupplierDashboard() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const { data: profile } = useQuery({
    queryKey: ['supplier', 'profile', userId],
    queryFn: () => getSupplierMe(),
    enabled: Boolean(userId),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['supplier', 'orders', userId],
    queryFn: () => getSupplierOrders(),
    enabled: Boolean(userId),
  });

  const pending = orders.filter((o) => String(o.fulfillmentStatus || 'PENDING').toUpperCase() === 'PENDING').length;
  const net = orders.reduce((s, o) => s + Number(o.supplierEarning ?? 0), 0);

  const recent = [...orders]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 5);

  const storeTitle = profile?.businessName || profile?.name || 'Your store';

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6 md:space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Supplier Dashboard</h1>
            <p className="text-sm text-muted-foreground sm:text-base">{storeTitle}</p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/supplier/orders">
              Open orders <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <ShoppingCart className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{orders.length}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Total orders</p>
              </div>
            </div>
          </Card>
          <Card className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <ClipboardList className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{pending}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Pending</p>
              </div>
            </div>
          </Card>
          <Card className="card-elevated p-4 sm:p-6 sm:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{formatCurrency(net)}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Net earnings (93% cumulative)</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-lg border-b-2 border-primary pb-2">Recent orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}
            {recent.map((o) => (
              <Link
                key={o.id}
                to={`/supplier/orders?orderId=${encodeURIComponent(o.id)}`}
                className="flex items-center justify-between gap-4 border-b border-border/70 py-3 last:border-0 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-md"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">#{o.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{formatCurrency(Number(o.supplierEarning ?? 0))}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {String(o.fulfillmentStatus || 'pending').toLowerCase()}
                  </p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
