import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/formatCurrency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseInitialDate } from '@/components/supplier/SupplierEarningsEnhanced';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SupplierBranchProfile } from '@/types';

export type OrgWithdrawalHistoryRow = {
  id: string;
  branchId: string;
  branchName: string;
  amount: number;
  status: string;
  createdAt: string;
};

type SupplierOrgWithdrawalHistoryPanelProps = {
  queryKeyPrefix: string;
  fetchWithdrawals: (filters: {
    from?: string;
    to?: string;
    branchId?: string;
  }) => Promise<{ withdrawals: OrgWithdrawalHistoryRow[] }>;
  branches?: SupplierBranchProfile[];
  initialFrom?: string | null;
  initialTo?: string | null;
  controlledFrom?: string;
  controlledTo?: string;
  onControlledFromChange?: (v: string) => void;
  onControlledToChange?: (v: string) => void;
  exportFileTag?: string;
  heading?: string;
  description?: string;
};

function formatWithdrawalStatus(status: string): string {
  return String(status || 'pending').toLowerCase().replace(/_/g, ' ');
}

export function SupplierOrgWithdrawalHistoryPanel({
  queryKeyPrefix,
  fetchWithdrawals,
  branches,
  initialFrom,
  initialTo,
  controlledFrom,
  controlledTo,
  onControlledFromChange,
  onControlledToChange,
  exportFileTag = 'org-withdrawals',
  heading = 'History of withdrawals',
  description = 'Past payout requests across branches',
}: SupplierOrgWithdrawalHistoryPanelProps) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);

  const [internalFrom, setInternalFrom] = useState(() => parseInitialDate(initialFrom ?? undefined, monthAgo));
  const [internalTo, setInternalTo] = useState(() => parseInitialDate(initialTo ?? undefined, today));
  const [branchFilter, setBranchFilter] = useState('');

  const from = controlledFrom ?? internalFrom;
  const to = controlledTo ?? internalTo;
  const setFrom = onControlledFromChange ?? setInternalFrom;
  const setTo = onControlledToChange ?? setInternalTo;

  const { data, isLoading } = useQuery({
    queryKey: [queryKeyPrefix, 'branch-withdrawals', from, to, branchFilter || '__all__'],
    queryFn: () =>
      fetchWithdrawals({
        from,
        to,
        ...(branchFilter ? { branchId: branchFilter } : {}),
      }),
  });

  const rows: OrgWithdrawalHistoryRow[] = data?.withdrawals ?? [];

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        Branch: row.branchName || row.branchId,
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
    writeFile(wb, `${exportFileTag}-${from}-to-${to}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(12);
    doc.text(`Withdrawal history (${from} to ${to})`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [['Branch', 'Date', 'Amount (ZAR)', 'Status', 'ID']],
      body: rows.map((row) => [
        row.branchName || row.branchId,
        new Date(row.createdAt).toLocaleString('en-ZA'),
        Number(row.amount || 0).toFixed(2),
        formatWithdrawalStatus(row.status),
        row.id,
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
    });
    doc.save(`${exportFileTag}-${from}-to-${to}.pdf`);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="card-elevated overflow-hidden">
        <div className="border-b border-border p-4 sm:p-6">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-0 p-4 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-primary pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
              {!controlledFrom && !controlledTo ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-withdrawals-from" className="text-xs text-muted-foreground">
                      From Date
                    </Label>
                    <Input
                      id="org-withdrawals-from"
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="w-full sm:w-[10.5rem]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-withdrawals-to" className="text-xs text-muted-foreground">
                      To Date
                    </Label>
                    <Input
                      id="org-withdrawals-to"
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="w-full sm:w-[10.5rem]"
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Using the date range selected above.</p>
              )}
              {branches && branches.length > 0 ? (
                <div className="space-y-1.5 w-full sm:w-56">
                  <Label className="text-xs text-muted-foreground">Branch</Label>
                  <Select value={branchFilter || '__all__'} onValueChange={(v) => setBranchFilter(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All branches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All branches</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.displayName || b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
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
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-3 py-2">{row.branchName || '—'}</td>
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
