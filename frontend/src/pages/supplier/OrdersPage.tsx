import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { SupplierOrders } from '@/components/supplier/SupplierOrders';

export default function SupplierOrdersPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Orders</h1>
        </div>
        <SupplierOrders userId={userId} />
      </div>
    </DashboardLayout>
  );
}
