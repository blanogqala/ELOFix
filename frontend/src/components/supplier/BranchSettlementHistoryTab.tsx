import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBranchSettlementHistory, type BranchSettlementEventRow } from '@/lib/api/supplierPortal';
import { formatCurrency } from '@/lib/formatCurrency';
import { settlementStatusLabel } from '@/lib/branchSettlementDisplay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toDateInputValue, parseInitialDate } from '@/components/supplier/SupplierEarningsEnhanced';

type BranchSettlementHistoryTabProps = {
  branchId: string;
  userId: string;
  initialFrom?: string | null;
  initialTo?: string | null;
};

function formatEventType(type: string): string {
  return String(type || '')
    .toLowerCase()
    .replace(/_/g, ' ');
}

export function BranchSettlementHistoryTab({
  branchId,
  userId,
  initialFrom,
  initialTo,
}: BranchSettlementHistoryTabProps) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);

  const [from, setFrom] = useState(() => parseInitialDate(initialFrom ?? undefined, monthAgo));
  const [to, setTo] = useState(() => parseInitialDate(initialTo ?? undefined, today));

  const { data, isLoading } = useQuery({
    queryKey: ['supplier', 'branch-settlement-history', branchId, userId, from, to],
    queryFn: () => getBranchSettlementHistory(branchId, { from, to }),
    enabled: Boolean(branchId && userId),
  });

  const rows: BranchSettlementEventRow[] = data?.events ?? [];

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        Date: new Date(row.createdAt).toLocaleString('en-ZA'),
        Order: row.materialOrderId || '—',
        Type: formatEventType(row.eventType),
        Gross: Number(row.grossAmount || 0),
        Commission: Number(row.commissionAmount || 0),
        Net: Number(row.netAmount || 0),
        Status: settlementStatusLabel(row.settlementStatus),
        Gateway: row.gatewayReference || row.gatewaySettlementId || '—',
      })),
    [rows]
  );

  const exportExcel = () => {
    const ws = utils.json_to_sheet(exportRows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'History');
    writeFile(wb, `branch-settlement-history-${branchId.slice(0, 8)}-${from}-to-${to}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(12);
    doc.text(`Branch settlement history (${from} to ${to})`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [['Date', 'Order', 'Type', 'Gross', 'Commission', 'Net', 'Status', 'Gateway ref']],
      body: rows.map((row) => [
        new Date(row.createdAt).toLocaleString('en-ZA'),
        row.materialOrderId || '—',
        formatEventType(row.eventType),
        Number(row.grossAmount || 0).toFixed(2),
        Number(row.commissionAmount || 0).toFixed(2),
        Number(row.netAmount || 0).toFixed(2),
        settlementStatusLabel(row.settlementStatus),
        row.gatewayReference || row.gatewaySettlementId || '—',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
    });
    doc.save(`branch-settlement-history-${branchId.slice(0, 8)}-${from}-to-${to}.pdf`);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="card-elevated overflow-hidden">
        <div className="border-b border-border p-4 sm:p-6">
          <h2 className="text-lg font-semibold">History</h2>
          <p className="text-sm text-muted-foreground">Financial transactions and settlement activity for this branch</p>
        </div>
        <div className="space-y-0 p-4 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-primary pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="history-from" className="text-xs text-muted-foreground">
                  From Date
                </Label>
                <Input
                  id="history-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full sm:w-[10.5rem]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="history-to" className="text-xs text-muted-foreground">
                  To Date
                </Label>
                <Input
                  id="history-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full sm:w-[10.5rem]"
                />
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
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading history…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions in the selected range.</p>
            ) : (
              <div className="overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Gross</th>
                      <th className="px-3 py-2">Commission</th>
                      <th className="px-3 py-2">Net</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Gateway ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString('en-ZA')}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{row.materialOrderId?.slice(0, 8) || '—'}</td>
                        <td className="px-3 py-2 capitalize">{formatEventType(row.eventType)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatCurrency(row.grossAmount)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatCurrency(row.commissionAmount)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatCurrency(row.netAmount)}</td>
                        <td className="px-3 py-2">{settlementStatusLabel(row.settlementStatus)}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.gatewayReference || row.gatewaySettlementId || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
