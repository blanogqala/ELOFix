import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { SupplierInventory } from '@/components/supplier/SupplierInventory';
import { SupplierInventoryReadOnly } from '@/components/supplier/SupplierInventoryReadOnly';

export default function SupplierInventoryPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const isSupplier = user?.role === 'supplier';

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Inventory</h1>
        </div>
        {isSupplier ? <SupplierInventoryReadOnly userId={userId} /> : <SupplierInventory userId={userId} />}
      </div>
    </DashboardLayout>
  );
}
