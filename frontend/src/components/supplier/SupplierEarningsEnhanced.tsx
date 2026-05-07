import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupplierOrdersExport, type SupplierOrdersExportRow } from '@/lib/api/supplierPortal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/formatCurrency';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function toDateInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatStatus(status: string): string {
  return String(status || 'PENDING').toLowerCase().replace(/_/g, ' ');
}

export function SupplierEarningsEnhanced({ userId }: { userId: string }) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);

  const [from, setFrom] = useState<string>(toDateInputValue(monthAgo));
  const [to, setTo] = useState<string>(toDateInputValue(today));

  const { data, isLoading } = useQuery({
    queryKey: ['supplier', 'orders-export', userId, from, to],
    queryFn: () => getSupplierOrdersExport({ from, to }),
    enabled: Boolean(userId),
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

  const exportExcel = () => {
    const ws = utils.json_to_sheet(exportRows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Earnings');
    writeFile(wb, `supplier-earnings-${from}-to-${to}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(12);
    doc.text(`Supplier Earnings (${from} to ${to})`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [['Order ID', 'Status', 'Total', 'Commission', 'Net', 'Cancellation', 'Reason', 'Cancelled By']],
      body: rows.map((row: SupplierOrdersExportRow) => [
        String(row.orderId || ''),
        formatStatus(row.status || ''),
        String(Number(row.totalAmount || 0).toFixed(2)),
        String(Number(row.commission || 0).toFixed(2)),
        String(Number(row.netEarnings || 0).toFixed(2)),
        row.isCancelled ? 'Cancelled' : 'Active',
        String(row.cancellationReason || ''),
        String(row.cancelledBy || ''),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
    });
    doc.save(`supplier-earnings-${from}-to-${to}.pdf`);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading earnings...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(summary.totalRevenueImpact)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Cancelled orders reduce this figure</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commission</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(summary.totalCommissionImpact)}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(summary.totalNetImpact)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="card-elevated">
        <CardHeader className=" grid grid-cols-2 gap-0 pb-4 border-b-2 border-primary">
          <CardTitle className="col-span-1 text-base">Orders</CardTitle>
          <p className="col-span-1 ml-auto text-xs text-muted-foreground">
            {summary.orderCount} in range · {summary.cancelledCount} cancelled
          </p>
        </CardHeader>
        <CardContent className="space-y-0 pt-2">
          <div className="flex flex-col gap-4 border-b-2 border-primary pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="earnings-from" className="text-xs text-muted-foreground">
                  From Date
                </Label>
                <Input id="earnings-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full sm:w-[10.5rem]" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="earnings-to" className="text-xs text-muted-foreground">
                  To Date
                </Label>
                <Input id="earnings-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full sm:w-[10.5rem]" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
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

          <div className="pt-4">
            <div className="overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Order ID</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Commission</th>
                    <th className="px-3 py-2">Net</th>
                    <th className="px-3 py-2">Cancelled By</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-muted-foreground" colSpan={7}>
                        No orders in selected range.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.orderId} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{row.orderId}</td>
                        <td className="px-3 py-2 capitalize">{formatStatus(row.status)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatCurrency(Number(row.totalAmount || 0))}</td>
                        <td className="px-3 py-2 tabular-nums">{formatCurrency(Number(row.commission || 0))}</td>
                        <td className="px-3 py-2 tabular-nums">{formatCurrency(Number(row.netEarnings || 0))}</td>
                        <td className="px-3 py-2">{row.cancelledBy || '-'}</td>
                        <td className="px-3 py-2">{row.cancellationReason || '-'}</td>
                      </tr>
                    ))
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
