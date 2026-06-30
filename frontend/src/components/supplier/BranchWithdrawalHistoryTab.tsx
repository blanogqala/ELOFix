import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBranchWithdrawals, type BranchWithdrawalRow } from '@/lib/api/supplierPortal';
import { formatCurrency } from '@/lib/formatCurrency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toDateInputValue, parseInitialDate } from '@/components/supplier/SupplierEarningsEnhanced';

type BranchWithdrawalHistoryTabProps = {
  branchId: string;
  userId: string;
  initialFrom?: string | null;
  initialTo?: string | null;
};

function formatWithdrawalStatus(status: string): string {
  return String(status || 'pending').toLowerCase().replace(/_/g, ' ');
}

export function BranchWithdrawalHistoryTab({
  branchId,
  userId,
  initialFrom,
  initialTo,
}: BranchWithdrawalHistoryTabProps) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);

  const [from, setFrom] = useState(() => parseInitialDate(initialFrom ?? undefined, monthAgo));
  const [to, setTo] = useState(() => parseInitialDate(initialTo ?? undefined, today));

  const { data, isLoading } = useQuery({
    queryKey: ['supplier', 'branch-withdrawals', branchId, userId, from, to],
    queryFn: () => getBranchWithdrawals(branchId, { from, to }),
    enabled: Boolean(branchId && userId),
  });

  const rows: BranchWithdrawalRow[] = data?.withdrawals ?? [];

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        Date: new Date(row.createdAt).toLocaleString('en-ZA'),
        Amount: Number(row.amount || 0),
        Status: formatWithdrawalStatus(row.status),
        ID: row.id,
      })),
    [rows]
  );

  const exportExcel = () => {
    const ws = utils.json_to_sheet(exportRows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Withdrawals');
    writeFile(wb, `branch-withdrawals-${branchId.slice(0, 8)}-${from}-to-${to}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(12);
    doc.text(`Branch withdrawal history (${from} to ${to})`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [['Date', 'Amount (ZAR)', 'Status', 'ID']],
      body: rows.map((row) => [
        new Date(row.createdAt).toLocaleString('en-ZA'),
        Number(row.amount || 0).toFixed(2),
        formatWithdrawalStatus(row.status),
        row.id,
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
    });
    doc.save(`branch-withdrawals-${branchId.slice(0, 8)}-${from}-to-${to}.pdf`);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="card-elevated overflow-hidden">
        <div className="border-b border-border p-4 sm:p-6">
          <h2 className="text-lg font-semibold">History of withdrawals</h2>
          <p className="text-sm text-muted-foreground">Past payout requests for this branch</p>
        </div>
        <div className="space-y-0 p-4 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-primary pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="withdrawals-from" className="text-xs text-muted-foreground">
                  From Date
                </Label>
                <Input
                  id="withdrawals-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full sm:w-[10.5rem]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="withdrawals-to" className="text-xs text-muted-foreground">
                  To Date
                </Label>
                <Input
                  id="withdrawals-to"
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
              <p className="text-sm text-muted-foreground">Loading withdrawal history…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No withdrawals in the selected range.</p>
            ) : (
              <div className="overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-3 py-2 tabular-nums">
                          {new Date(row.createdAt).toLocaleString('en-ZA')}
                        </td>
                        <td className="px-3 py-2 font-medium tabular-nums">{formatCurrency(row.amount)}</td>
                        <td className="px-3 py-2 capitalize">{formatWithdrawalStatus(row.status)}</td>
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
