import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getSupplierOrdersExport,
  getSupplierMe,
  getSupplierAnalyticsBranches,
  getSupplierOrgSettlementHistory,
  EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY,
  type SupplierOrdersExportRow,
} from '@/lib/api/supplierPortal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/formatCurrency';
import { supplierBranchGrossRevenue } from '@/lib/supplierAnalyticsDisplay';
import {
  computeActiveSubtotal,
  computeCompletedSubtotal,
  computePendingSubtotal,
  hasExportRowRefund,
  matchesStatusFilter,
  resolveActiveSummary,
  type OrderStatusFilter,
} from '@/lib/supplierOrdersExportDisplay';
import { cn } from '@/lib/utils';
import { FileSpreadsheet, FileText, Building2, ChevronRight, MapPin } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SupplierSettlementHistoryPanel } from '@/components/supplier/SupplierSettlementHistoryPanel';

export function toDateInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseInitialDate(s: string | undefined, fallback: Date): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return toDateInputValue(fallback);
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? toDateInputValue(fallback) : s;
}

function formatStatus(status: string): string {
  return String(status || 'PENDING').toLowerCase().replace(/_/g, ' ');
}

/** Single-branch or org-wide orders table + export + summary cards for the selected date range. */
export function SupplierEarningsOrdersPanel({
  userId,
  branchId,
  initialFrom,
  initialTo,
  heading,
  showOrdersCardHeader = true,
  controlledFrom,
  controlledTo,
  onControlledFromChange,
  onControlledToChange,
  hideRangeInputs = false,
  omitSummaryCards = false,
  hideExportButtons = false,
}: {
  userId: string;
  branchId?: string;
  initialFrom?: string | null;
  initialTo?: string | null;
  heading?: string;
  showOrdersCardHeader?: boolean;
  controlledFrom?: string;
  controlledTo?: string;
  onControlledFromChange?: (v: string) => void;
  onControlledToChange?: (v: string) => void;
  hideRangeInputs?: boolean;
  /** When nested in earnings hub — table & export only (top KPIs handled by hub). */
  omitSummaryCards?: boolean;
  /** Hide Excel/PDF export (e.g. branch page moves export to withdrawal history tab). */
  hideExportButtons?: boolean;
}) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);

  const [internalFrom, setInternalFrom] = useState(() => parseInitialDate(initialFrom ?? undefined, monthAgo));
  const [internalTo, setInternalTo] = useState(() => parseInitialDate(initialTo ?? undefined, today));
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('__all__');

  const from = controlledFrom ?? internalFrom;
  const to = controlledTo ?? internalTo;
  const setFrom = onControlledFromChange ?? setInternalFrom;
  const setTo = onControlledToChange ?? setInternalTo;

  const exportTag = branchId ? `branch-${branchId.slice(0, 8)}` : 'all-branches';

  const { data, isLoading } = useQuery({
    queryKey: ['supplier', 'orders-export', userId, from, to, branchId ?? '__all__'],
    queryFn: () =>
      getSupplierOrdersExport({
        from,
        to,
        ...(branchId ? { branchId } : {}),
      }),
    enabled: Boolean(userId),
  });

  const rows = data?.rows || [];
  const summary = data?.summary || { ...EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY };
  const activeSummary = useMemo(() => resolveActiveSummary(summary, rows), [summary, rows]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesStatusFilter(row, statusFilter)),
    [rows, statusFilter]
  );

  const filteredCompletedSubtotal = useMemo(
    () => computeCompletedSubtotal(filteredRows),
    [filteredRows]
  );

  const filteredActiveSubtotal = useMemo(
    () => computeActiveSubtotal(filteredRows),
    [filteredRows]
  );

  const filteredPendingSubtotal = useMemo(
    () => computePendingSubtotal(filteredRows),
    [filteredRows]
  );

  const exportRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        Branch: row.branchName || '',
        'Order ID': row.orderId,
        Status: row.status,
        'Total Amount': Number(row.totalAmount || 0),
        'Commission (7%)': Number(row.commission || 0),
        'Net Earnings': Number(row.netEarnings || 0),
        'Revenue Impact': Number(row.revenueImpact || 0),
        'Commission Impact': Number(row.commissionImpact || 0),
        'Net Impact': Number(row.netImpact || 0),
        'Cancellation Status': row.isCancelled ? 'Cancelled' : 'Active',
        'Cancellation Reason': row.cancellationReason || '',
        'Cancelled By': row.cancelledBy || '',
        'Refund Amount': Number(row.refundAmount || 0),
        'Refund Status': row.refundStatus || '',
        Date: row.createdAt || '',
      })),
    [filteredRows]
  );

  const exportExcel = () => {
    const ws = utils.json_to_sheet(exportRows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Earnings');
    writeFile(wb, `supplier-earnings-${exportTag}-${from}-to-${to}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(12);
    doc.text(`Supplier Earnings (${heading || exportTag}) (${from} to ${to})`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [['Branch', 'Order ID', 'Status', 'Total', 'Commission', 'Net', 'Refund', 'Cancellation', 'Reason', 'Cancelled By']],
      body: filteredRows.map((row: SupplierOrdersExportRow) => [
        String(row.branchName || '—'),
        String(row.orderId || ''),
        formatStatus(row.status || ''),
        String(Number(row.totalAmount || 0).toFixed(2)),
        String(Number(row.commission || 0).toFixed(2)),
        String(Number(row.netEarnings || 0).toFixed(2)),
        hasExportRowRefund(row) ? String(Number(row.refundAmount || 0).toFixed(2)) : '—',
        row.isCancelled ? 'Cancelled' : 'Active',
        String(row.cancellationReason || ''),
        String(row.cancelledBy || ''),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
    });
    doc.save(`supplier-earnings-${exportTag}-${from}-to-${to}.pdf`);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading earnings...</p>;
  }

  return (
    <div className="space-y-6">
      {heading ? <h2 className="text-lg font-semibold">{heading}</h2> : null}

      {!omitSummaryCards ? (
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(activeSummary.revenue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Completed & pending · excluding cancelled</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commission</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(activeSummary.commission)}</p>
            <p className="mt-1 text-xs text-muted-foreground">7% on active orders</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(activeSummary.net)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Supplier share · excluding cancelled</p>
          </CardContent>
        </Card>
      </div>
      ) : null}

      <Card className="card-elevated">
        {showOrdersCardHeader && (
          <CardHeader className=" grid grid-cols-2 gap-0 pb-4 border-b-2 border-primary">
            <CardTitle className="col-span-1 text-base">Orders</CardTitle>
            <p className="col-span-1 ml-auto text-xs text-muted-foreground">
              {summary.orderCount} in range · {summary.completedCount} completed · {summary.cancelledCount}{' '}
              cancelled
              {summary.pendingCount > 0 ? ` · ${summary.pendingCount} pending` : ''}
              {statusFilter !== '__all__' ? ` · showing ${filteredRows.length} ${statusFilter}` : ''}
            </p>
          </CardHeader>
        )}
        <CardContent className="space-y-0 pt-2">
          <div className="flex flex-col gap-4 border-b-2 border-primary pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            {!hideRangeInputs ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="earnings-from" className="text-xs text-muted-foreground">
                  From Date
                </Label>
                <Input
                  id="earnings-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full sm:w-[10.5rem]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="earnings-to" className="text-xs text-muted-foreground">
                  To Date
                </Label>
                <Input
                  id="earnings-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full sm:w-[10.5rem]"
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-56">
                <Label className="text-xs text-muted-foreground">Order status</Label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatusFilter)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="pending">Pending / in progress</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <p className="text-xs text-muted-foreground">Using the date range selected above.</p>
                <div className="space-y-1.5 w-full sm:w-56">
                  <Label className="text-xs text-muted-foreground">Order status</Label>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatusFilter)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All statuses</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="pending">Pending / in progress</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {!hideExportButtons ? (
                <>
              <Button type="button" variant="outline" size="sm" onClick={exportExcel} disabled={filteredRows.length === 0}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={exportPdf} disabled={filteredRows.length === 0}>
                <FileText className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="pt-4">
            <div className="overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2">Order ID</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Commission</th>
                    <th className="px-3 py-2">Net</th>
                    <th className="px-3 py-2">Refund</th>
                    <th className="px-3 py-2">Cancelled By</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-muted-foreground" colSpan={9}>
                        No orders in selected range.
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-muted-foreground" colSpan={9}>
                        No orders match the selected status filter.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {filteredRows.map((row) => (
                        <tr
                          key={row.orderId}
                          className={cn(
                            'border-t border-border',
                            row.isCancelled && 'bg-muted/20 text-muted-foreground'
                          )}
                        >
                          <td className="px-3 py-2 max-w-[10rem] truncate" title={row.branchName || ''}>
                            {row.branchName || '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{row.orderId}</td>
                          <td className="px-3 py-2 capitalize">{formatStatus(row.status)}</td>
                          <td
                            className={cn(
                              'px-3 py-2 tabular-nums',
                              row.isCancelled && 'line-through decoration-destructive/50'
                            )}
                          >
                            {formatCurrency(Number(row.totalAmount || 0))}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-2 tabular-nums',
                              row.isCancelled && 'line-through decoration-destructive/50'
                            )}
                          >
                            {formatCurrency(Number(row.commission || 0))}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-2 tabular-nums',
                              row.isCancelled && 'line-through decoration-destructive/50'
                            )}
                          >
                            {formatCurrency(Number(row.netEarnings || 0))}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-destructive">
                            {hasExportRowRefund(row) ? formatCurrency(Number(row.refundAmount || 0)) : '—'}
                          </td>
                          <td className="px-3 py-2">{row.cancelledBy || '—'}</td>
                          <td className="px-3 py-2">{row.cancellationReason || '—'}</td>
                        </tr>
                      ))}
                      {filteredActiveSubtotal.count > 0 && statusFilter === '__all__' && (
                        <tr className="border-t-2 border-primary/40 bg-primary/5 font-semibold">
                          <td className="px-3 py-2.5" colSpan={3}>
                            Active subtotal ({filteredActiveSubtotal.count})
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatCurrency(filteredActiveSubtotal.revenue)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatCurrency(filteredActiveSubtotal.commission)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatCurrency(filteredActiveSubtotal.net)}
                          </td>
                          <td className="px-3 py-2.5" colSpan={3} />
                        </tr>
                      )}
                      {filteredCompletedSubtotal.count > 0 && statusFilter === 'completed' && (
                        <tr className="border-t-2 border-primary/40 bg-primary/5 font-semibold">
                          <td className="px-3 py-2.5" colSpan={3}>
                            Completed subtotal ({filteredCompletedSubtotal.count})
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatCurrency(filteredCompletedSubtotal.revenue)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatCurrency(filteredCompletedSubtotal.commission)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatCurrency(filteredCompletedSubtotal.net)}
                          </td>
                          <td className="px-3 py-2.5" colSpan={3} />
                        </tr>
                      )}
                      {filteredPendingSubtotal.count > 0 && statusFilter === 'pending' && (
                        <tr className="border-t-2 border-primary/40 bg-primary/5 font-semibold">
                          <td className="px-3 py-2.5" colSpan={3}>
                            Pending subtotal ({filteredPendingSubtotal.count})
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatCurrency(filteredPendingSubtotal.revenue)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatCurrency(filteredPendingSubtotal.commission)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatCurrency(filteredPendingSubtotal.net)}
                          </td>
                          <td className="px-3 py-2.5" colSpan={3} />
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Supplier-owner hub: aggregates for date range + branch tiles with scoped stats. */
export function SupplierEarningsHub({ userId }: { userId: string }) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);

  const [from, setFrom] = useState<string>(toDateInputValue(monthAgo));
  const [to, setTo] = useState<string>(toDateInputValue(today));
  const [cityFilter, setCityFilter] = useState('');
  const [branchSearch, setBranchSearch] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['supplier', 'profile', userId],
    queryFn: () => getSupplierMe(),
    enabled: Boolean(userId),
  });

  const distinctCities = useMemo(() => {
    const s = new Set<string>();
    for (const b of profile?.branches ?? []) {
      const c = (b.city || '').trim();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [profile?.branches]);

  const { data: hubExport, isLoading: hubLoading } = useQuery({
    queryKey: ['supplier', 'orders-export', userId, from, to, '__all__'],
    queryFn: () => getSupplierOrdersExport({ from, to }),
    enabled: Boolean(userId),
  });

  const { data: branchAnalyticsData, isLoading: branchesLoading } = useQuery({
    queryKey: ['supplier', 'analytics', 'branches', 'earnings-hub', userId, cityFilter, branchSearch, from, to],
    queryFn: () =>
      getSupplierAnalyticsBranches({
        ...(cityFilter ? { city: cityFilter } : {}),
        ...(branchSearch.trim() ? { q: branchSearch.trim() } : {}),
        from,
        to,
      }),
    enabled: Boolean(userId),
  });
  const branchRows = branchAnalyticsData?.branches ?? [];
  const totalPendingSettlement = branchAnalyticsData?.totalPendingSettlement ?? 0;
  const totalSettled = branchAnalyticsData?.totalSettled ?? 0;

  const hubSummary = hubExport?.summary ?? { ...EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY };
  const hubRows = hubExport?.rows ?? [];
  const hubActiveSummary = useMemo(
    () => resolveActiveSummary(hubSummary, hubRows),
    [hubSummary, hubRows]
  );

  return (
    <div className="space-y-6">
      {hubLoading || branchesLoading ? (
        <p className="text-sm text-muted-foreground">Loading summary…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(hubActiveSummary.revenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hubSummary.orderCount} orders in range · {hubSummary.completedCount} completed ·{' '}
                {hubSummary.cancelledCount} cancelled
                {hubSummary.pendingCount > 0 ? ` · ${hubSummary.pendingCount} pending` : ''}
              </p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total commission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(hubActiveSummary.commission)}</p>
              <p className="mt-1 text-xs text-muted-foreground">7% on active orders</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total net earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(hubActiveSummary.net)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Supplier share · excluding cancelled</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
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
          <Card className="card-elevated sm:col-span-2 lg:col-span-1">
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

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="hub-earnings-from" className="text-xs text-muted-foreground">
            From Date
          </Label>
          <Input
            id="hub-earnings-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full sm:w-[10.5rem]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hub-earnings-to" className="text-xs text-muted-foreground">
            To Date
          </Label>
          <Input
            id="hub-earnings-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full sm:w-[10.5rem]"
          />
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-56">
          <Label className="text-xs text-muted-foreground">City</Label>
          <Select value={cityFilter || '__all__'} onValueChange={(v) => setCityFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="All cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All cities</SelectItem>
              {distinctCities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-full flex-1 sm:max-w-sm">
          <Label className="text-xs text-muted-foreground">Search branches</Label>
          <Input
            className="mt-1.5"
            placeholder="Name, address, manager email…"
            value={branchSearch}
            onChange={(e) => setBranchSearch(e.target.value)}
          />
        </div>
      </div>

      {branchesLoading ? (
        <p className="text-sm text-muted-foreground">Loading branches…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {branchRows.length === 0 && (
            <p className="text-sm text-muted-foreground sm:col-span-2">No branches match filters for this range.</p>
          )}
          {branchRows.map((b) => (
            <Link
              key={b.branchId}
              to={`/supplier/earnings/branch/${encodeURIComponent(b.branchId)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
              className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="card-elevated h-full transition-colors hover:bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">{b.name}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription className="flex items-start gap-1 line-clamp-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {[b.address, b.city, b.area].filter(Boolean).join(' · ') || '—'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Orders</span>
                    <span className="font-medium">{b.totalOrders}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-medium">{b.pendingOrders}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Net + 7%</span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(supplierBranchGrossRevenue(b))}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Pending settlement</span>
                    <span className="font-medium text-primary">
                      {formatCurrency(b.pendingSettlement ?? 0)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="orders">List of Orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <SupplierEarningsOrdersPanel
            userId={userId}
            heading="All orders (all branches)"
            showOrdersCardHeader
            controlledFrom={from}
            controlledTo={to}
            onControlledFromChange={setFrom}
            onControlledToChange={setTo}
            hideRangeInputs
            omitSummaryCards
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <SupplierSettlementHistoryPanel
            queryKeyPrefix={`supplier-${userId}-earnings-hub`}
            fetchEvents={getSupplierOrgSettlementHistory}
            branches={profile?.branches}
            initialFrom={from}
            initialTo={to}
            controlledFrom={from}
            controlledTo={to}
            onControlledFromChange={setFrom}
            onControlledToChange={setTo}
            exportFileTag="supplier-earnings-settlements"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** @deprecated Use SupplierEarningsOrdersPanel or SupplierEarningsHub */
export function SupplierEarningsEnhanced({ userId }: { userId: string }) {
  return <SupplierEarningsOrdersPanel userId={userId} />;
}
