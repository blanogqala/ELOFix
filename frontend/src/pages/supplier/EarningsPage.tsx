import { Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { SupplierEarningsHub } from '@/components/supplier/SupplierEarningsEnhanced';

export default function SupplierEarningsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  if (user?.role === 'branch_staff') {
    if (user.branchId) {
      return <Navigate to={`/supplier/earnings/branch/${encodeURIComponent(user.branchId)}`} replace />;
    }
    return (
      <DashboardLayout>
        <p className="p-6 text-sm text-muted-foreground">Missing branch assignment.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6 p-4 pb-24">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Earnings</h1>
          <p className="text-sm text-muted-foreground">Review revenue by branch and open drill-down exports.</p>
        </div>
        <SupplierEarningsHub userId={userId} />
      </div>
    </DashboardLayout>
  );
}
