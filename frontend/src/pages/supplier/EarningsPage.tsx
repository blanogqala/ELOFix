import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { SupplierEarningsEnhanced } from '@/components/supplier/SupplierEarningsEnhanced';

export default function SupplierEarningsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Earnings</h1>
        </div>
        <SupplierEarningsEnhanced userId={userId} />
      </div>
    </DashboardLayout>
  );
}
