import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getAdminSupplierSettlementSummary,
  getAdminSupplierSettlementHistory,
  getAdminSupplierOrdersExport,
} from '@/lib/api/admin';
import { EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY } from '@/lib/api/supplierPortal';
import { parseInitialDate } from '@/components/supplier/SupplierEarningsEnhanced';
import { AdminSupplierOrdersPanel } from '@/components/admin/AdminSupplierOrdersPanel';
import { SupplierSettlementHistoryPanel } from '@/components/supplier/SupplierSettlementHistoryPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveActiveSummary } from '@/lib/supplierOrdersExportDisplay';
import type { SupplierBranchProfile } from '@/types';

export function AdminSupplierMaterialOrdersSection({
  supplierId,
  branches,
  businessLabel,
}: {
  supplierId: string;
  branches: SupplierBranchProfile[];
  businessLabel?: string;
}) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);

  const [from, setFrom] = useState(() => parseInitialDate(undefined, monthAgo));
  const [to, setTo] = useState(() => parseInitialDate(undefined, today));

  const { data: exportData, isLoading: exportLoading } = useQuery({
    queryKey: ['admin', 'supplier', supplierId, 'orders-export', from, to, '__all__'],
    queryFn: () => getAdminSupplierOrdersExport(supplierId, { from, to }),
    enabled: Boolean(supplierId),
  });

  const { data: settlementData, isLoading: settlementLoading } = useQuery({
    queryKey: ['admin', 'supplier', supplierId, 'settlement-summary', from, to],
    queryFn: () => getAdminSupplierSettlementSummary(supplierId, { from, to }),
    enabled: Boolean(supplierId),
  });

  const summary = exportData?.summary ?? { ...EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY };
  const rows = exportData?.rows ?? [];
  const activeSummary = useMemo(() => resolveActiveSummary(summary, rows), [summary, rows]);
  const totalPendingSettlement = settlementData?.totalPendingSettlement ?? 0;
  const totalSettled = settlementData?.totalSettled ?? 0;
  const summaryLoading = exportLoading || settlementLoading;

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">Material orders</h2>
      <p className="mb-6 text-sm text-muted-foreground max-w-3xl">
        Same earnings-style breakdown suppliers see: filter by date range and branch, export to Excel or PDF. Figures use
        the portal&apos;s revenue / commission / net impact rules (including cancellations).
      </p>

      {summaryLoading ? (
        <p className="mb-6 text-sm text-muted-foreground">Loading summary…</p>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="border-2 border-primary/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(activeSummary.revenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Completed & pending · excluding cancelled</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Commission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-accent">
                {formatCurrency(activeSummary.commission)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">7% on active orders</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(activeSummary.net)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Supplier share · excluding cancelled</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending settlement</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-primary">
                {formatCurrency(totalPendingSettlement)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">In selected date range · all branches</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Settled</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(totalSettled)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Verified branch settlements</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="admin-material-from" className="text-xs text-muted-foreground">
            From date
          </Label>
          <Input
            id="admin-material-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full sm:w-[11rem]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-material-to" className="text-xs text-muted-foreground">
            To date
          </Label>
          <Input
            id="admin-material-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full sm:w-[11rem]"
          />
        </div>
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="mb-4 grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="orders">List of Orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          <AdminSupplierOrdersPanel
            supplierId={supplierId}
            branches={branches}
            businessLabel={businessLabel}
            controlledFrom={from}
            controlledTo={to}
            onControlledFromChange={setFrom}
            onControlledToChange={setTo}
            hideRangeInputs
            omitSummaryCards
          />
        </TabsContent>
        <TabsContent value="history">
          <SupplierSettlementHistoryPanel
            queryKeyPrefix={`admin-supplier-${supplierId}`}
            fetchEvents={(filters) => getAdminSupplierSettlementHistory(supplierId, filters)}
            branches={branches}
            controlledFrom={from}
            controlledTo={to}
            onControlledFromChange={setFrom}
            onControlledToChange={setTo}
            exportFileTag={`admin-supplier-${supplierId.slice(0, 8)}-settlements`}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
