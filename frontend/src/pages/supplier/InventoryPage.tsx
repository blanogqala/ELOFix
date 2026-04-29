import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { SupplierInventory } from '@/components/supplier/SupplierInventory';

export default function SupplierInventoryPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Inventory</h1>
        </div>
        <SupplierInventory userId={userId} />
      </div>
    </DashboardLayout>
  );
}
