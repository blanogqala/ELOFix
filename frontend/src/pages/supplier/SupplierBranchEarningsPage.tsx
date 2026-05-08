import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getSupplierMe } from '@/lib/api/supplierPortal';
import { SupplierEarningsOrdersPanel } from '@/components/supplier/SupplierEarningsEnhanced';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function SupplierBranchEarningsPage() {
  const { user } = useAuth();
  const { branchId: branchParam } = useParams();
  const [searchParams] = useSearchParams();

  const userId = user?.id ?? '';
  const branchId = branchParam ? decodeURIComponent(branchParam) : '';
  const initialFrom = searchParams.get('from');
  const initialTo = searchParams.get('to');

  const needsSupplierProfile = user?.role === 'supplier' && Boolean(branchId && userId);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['supplier', 'profile', userId],
    queryFn: () => getSupplierMe(),
    enabled: needsSupplierProfile,
  });

  if (!user?.id || !branchId) {
    return <Navigate to="/supplier/earnings" replace />;
  }

  if (user.role === 'branch_staff') {
    if (user.branchId !== branchId) {
      return <Navigate to={`/supplier/earnings/branch/${encodeURIComponent(user.branchId)}`} replace />;
    }
  }

  if (user.role === 'supplier') {
    if (profileLoading) {
      return (
        <DashboardLayout>
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        </DashboardLayout>
      );
    }
    const branches = profile?.branches ?? [];
    if (!branches.some((b) => b.id === branchId)) {
      return <Navigate to="/supplier/earnings" replace />;
    }
  }

  const branchMeta = profile?.branches?.find((b) => b.id === branchId);
  const title = branchMeta?.displayName || branchMeta?.name || 'Branch';

  return (
    <DashboardLayout>
      <div className="animate-fade-in mx-auto max-w-5xl space-y-6 p-4 pb-24">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Branch earnings · {title}</h1>
            <p className="text-sm text-muted-foreground">Orders and payouts for this store.</p>
          </div>
          {user.role === 'supplier' && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/supplier/earnings">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to earnings
              </Link>
            </Button>
          )}
        </div>

        <SupplierEarningsOrdersPanel
          userId={user.id}
          branchId={branchId}
          initialFrom={initialFrom}
          initialTo={initialTo}
        />
      </div>
    </DashboardLayout>
  );
}
