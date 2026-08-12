import { useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSupplierMe,
  getSupplierOrdersExport,
  getBranchBalance,
  EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY,
} from '@/lib/api/supplierPortal';
import {
  SupplierEarningsOrdersPanel,
  parseInitialDate,
} from '@/components/supplier/SupplierEarningsEnhanced';
import { BranchBankDetailsTab } from '@/components/supplier/BranchBankDetailsTab';
import { BranchSettlementHistoryTab } from '@/components/supplier/BranchSettlementHistoryTab';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveActiveSummary } from '@/lib/supplierOrdersExportDisplay';
import { ArrowLeft } from 'lucide-react';

export default function SupplierBranchEarningsPage() {
  const { user } = useAuth();
  const { branchId: branchParam } = useParams();
  const [searchParams] = useSearchParams();

  const userId = user?.id ?? '';
  const branchId = branchParam ? decodeURIComponent(branchParam) : '';
  const initialFrom = searchParams.get('from');
  const initialTo = searchParams.get('to');
  const defaultTab = searchParams.get('tab') === 'bank-details' ? 'bank-details' : 'orders';

  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);
  const [from, setFrom] = useState(() => parseInitialDate(initialFrom ?? undefined, monthAgo));
  const [to, setTo] = useState(() => parseInitialDate(initialTo ?? undefined, today));

  const needsSupplierProfile = user?.role === 'supplier' && Boolean(branchId && userId);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['supplier', 'profile', userId],
    queryFn: () => getSupplierMe(),
    enabled: needsSupplierProfile,
  });

  const { data: ordersExport, isLoading: ordersLoading } = useQuery({
    queryKey: ['supplier', 'orders-export', userId, from, to, branchId],
    queryFn: () => getSupplierOrdersExport({ from, to, branchId }),
    enabled: Boolean(userId && branchId),
  });

  const { data: settlementSummary, isLoading: balanceLoading } = useQuery({
    queryKey: ['supplier', 'branch-settlement-summary', branchId, userId],
    queryFn: () => getBranchBalance(branchId),
    enabled: Boolean(userId && branchId),
  });

  const activeSummary = useMemo(() => {
    const rows = ordersExport?.rows ?? [];
    const summary = ordersExport?.summary ?? { ...EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY };
    return resolveActiveSummary(summary, rows);
  }, [ordersExport]);

  const isBranchStaff = user?.role === 'branch_staff';
  const canEditBankDetails =
    user?.role === 'supplier' || (isBranchStaff && user?.branchUserRole === 'MANAGER');
  const showBankDetailsTab = isBranchStaff || user?.role === 'supplier';

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
  const cardsLoading = ordersLoading || balanceLoading;

  return (
    <DashboardLayout>
      <div className="animate-fade-in mx-auto max-w-5xl space-y-6 p-4 pb-24">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Branch earnings · {title}</h1>
            <p className="text-sm text-muted-foreground">Material sales and settlement for this store.</p>
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">
                {cardsLoading ? '…' : formatCurrency(activeSummary.revenue)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Completed & pending · excluding cancelled</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Commission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">
                {cardsLoading ? '…' : formatCurrency(activeSummary.commission)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">EloFix commission (7%)</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {cardsLoading ? '…' : formatCurrency(activeSummary.net)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Branch share · excluding cancelled</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending settlement</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-primary">
                {balanceLoading ? '…' : formatCurrency(settlementSummary?.pendingSettlement ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Awaiting gateway settlement</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Settled</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {balanceLoading ? '…' : formatCurrency(settlementSummary?.settled ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Verified to branch bank</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className={`grid w-full max-w-2xl ${showBankDetailsTab ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            {showBankDetailsTab ? <TabsTrigger value="bank-details">Bank Details</TabsTrigger> : null}
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-4">
            <SupplierEarningsOrdersPanel
              userId={user.id}
              branchId={branchId}
              initialFrom={from}
              initialTo={to}
              controlledFrom={from}
              controlledTo={to}
              onControlledFromChange={setFrom}
              onControlledToChange={setTo}
              omitSummaryCards
              hideExportButtons
            />
          </TabsContent>

          {showBankDetailsTab ? (
            <TabsContent value="bank-details">
              <BranchBankDetailsTab
                branchId={branchId}
                canEdit={canEditBankDetails}
                settlementSummary={settlementSummary ?? null}
              />
            </TabsContent>
          ) : null}

          <TabsContent value="history">
            <BranchSettlementHistoryTab
              branchId={branchId}
              userId={user.id}
              initialFrom={from}
              initialTo={to}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
