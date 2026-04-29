import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { SupplierEarnings } from '@/components/supplier/SupplierEarnings';

export default function SupplierEarningsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Earnings</h1>
        </div>
        <SupplierEarnings userId={userId} />
      </div>
    </DashboardLayout>
  );
}
