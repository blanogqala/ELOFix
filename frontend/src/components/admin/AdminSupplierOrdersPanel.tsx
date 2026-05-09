import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminSupplierOrdersExport } from '@/lib/api/admin';
import type { SupplierOrdersExportRow } from '@/lib/api/supplierPortal';
import type { SupplierBranchProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/formatCurrency';
import { FileSpreadsheet, FileText, Search } from 'lucide-react';
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

function formatStatus(status: string): string {
  return String(status || 'PENDING').toLowerCase().replace(/_/g, ' ');
}

function parseInitialDate(s: string | undefined, fallback: Date): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return toDateInputValue(fallback);
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? toDateInputValue(fallback) : s;
}

function toDateInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function AdminSupplierOrdersPanel({
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
  const [branchScope, setBranchScope] = useState<string>('');
  const [branchPickFilter, setBranchPickFilter] = useState('');

  const branchChoices = useMemo(() => {
    const q = branchPickFilter.trim().toLowerCase();
    return (branches || []).filter((b) => {
      if (!q) return true;
      const name = (b.displayName || b.name || '').toLowerCase();
      const addr = [b.address, b.city, b.area].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q) || addr.includes(q);
    });
  }, [branches, branchPickFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'supplier', supplierId, 'orders-export', from, to, branchScope || '__all__'],
    queryFn: () =>
      getAdminSupplierOrdersExport(supplierId, {
        from,
        to,
        ...(branchScope ? { branchId: branchScope } : {}),
      }),
    enabled: Boolean(supplierId),
  });

  const rows = data?.rows || [];
  const summary = data?.summary || {
    orderCount: 0,
    cancelledCount: 0,
    totalRevenueImpact: 0,
    totalCommissionImpact: 0,
    totalNetImpact: 0,
  };

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
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
    [rows]
  );

  const safeSlug = (businessLabel || 'supplier').replace(/[^\w\-]+/g, '_').slice(0, 48);

  const exportExcel = () => {
    const ws = utils.json_to_sheet(exportRows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Orders');
    writeFile(wb, `admin-${safeSlug}-orders-${from}-to-${to}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(11);
    doc.text(`Material orders — ${businessLabel || supplierId} (${from} → ${to})`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [['Branch', 'Order ID', 'Status', 'Total', 'Commission', 'Net', 'Cancellation', 'Reason', 'Cancelled By']],
      body: rows.map((row: SupplierOrdersExportRow) => [
        String(row.branchName || '—'),
        String(row.orderId || ''),
        formatStatus(row.status || ''),
        String(Number(row.totalAmount || 0).toFixed(2)),
        String(Number(row.commission || 0).toFixed(2)),
        String(Number(row.netEarnings || 0).toFixed(2)),
        row.isCancelled ? 'Cancelled' : 'Active',
        String(row.cancellationReason || ''),
        String(row.cancelledBy || ''),
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
    });
    doc.save(`admin-${safeSlug}-orders-${from}-to-${to}.pdf`);
  };

  if (isLoading && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading orders…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-2 border-primary/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue impact</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(summary.totalRevenueImpact)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Completed & paid in range (see supplier earnings rules)</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-primary/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commission impact</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-accent">{formatCurrency(summary.totalCommissionImpact)}</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-primary/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net impact</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(summary.totalNetImpact)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-2 border-primary shadow-md">
        <CardHeader className="border-b border-primary/30 bg-muted/20 pb-4">
          <CardTitle className="text-base">Orders</CardTitle>
          <CardDescription>
            {summary.orderCount} in range · {summary.cancelledCount} cancelled — filter by branch and date, then export.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:flex-wrap xl:items-end xl:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="admin-sup-from" className="text-xs text-muted-foreground">
                  From date
                </Label>
                <Input
                  id="admin-sup-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full sm:w-[11rem]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-sup-to" className="text-xs text-muted-foreground">
                  To date
                </Label>
                <Input
                  id="admin-sup-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full sm:w-[11rem]"
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-56">
                <Label className="text-xs text-muted-foreground">Branch scope</Label>
                <Select
                  value={branchScope || '__all__'}
                  onValueChange={(v) => setBranchScope(v === '__all__' ? '' : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All branches" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__all__">All branches</SelectItem>
                    {branchChoices.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.displayName || b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 w-full sm:max-w-xs flex-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Search className="h-3 w-3" />
                  Filter branch list
                </Label>
                <Input
                  placeholder="Type to narrow branches in the dropdown…"
                  value={branchPickFilter}
                  onChange={(e) => setBranchPickFilter(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={exportExcel} disabled={rows.length === 0}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={exportPdf} disabled={rows.length === 0}>
                <FileText className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border-2 border-primary/40 bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Branch</th>
                  <th className="px-3 py-2.5 font-medium">Order ID</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Total</th>
                  <th className="px-3 py-2.5 font-medium">Commission</th>
                  <th className="px-3 py-2.5 font-medium">Net</th>
                  <th className="px-3 py-2.5 font-medium">Cancelled by</th>
                  <th className="px-3 py-2.5 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={8}>
                      No orders match this range {branchScope ? 'for the selected branch' : ''}.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.orderId} className="border-t border-border/80 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 max-w-[11rem] truncate font-medium" title={row.branchName || ''}>
                        {row.branchName || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{row.orderId}</td>
                      <td className="px-3 py-2 capitalize">{formatStatus(row.status)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCurrency(Number(row.totalAmount || 0))}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCurrency(Number(row.commission || 0))}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCurrency(Number(row.netEarnings || 0))}</td>
                      <td className="px-3 py-2">{row.cancelledBy || '—'}</td>
                      <td className="px-3 py-2 max-w-[14rem] truncate" title={row.cancellationReason || ''}>
                        {row.cancellationReason || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
