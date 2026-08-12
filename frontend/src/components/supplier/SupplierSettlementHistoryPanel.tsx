import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/formatCurrency';
import { settlementStatusLabel } from '@/lib/branchSettlementDisplay';
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
import type { BranchSettlementEventRow } from '@/lib/api/supplierPortal';
import type { SupplierBranchProfile } from '@/types';

type SupplierSettlementHistoryPanelProps = {
  queryKeyPrefix: string;
  fetchEvents: (filters: {
    from?: string;
    to?: string;
    branchId?: string;
  }) => Promise<{ events: BranchSettlementEventRow[] }>;
  branches?: SupplierBranchProfile[];
  initialFrom?: string | null;
  initialTo?: string | null;
  controlledFrom?: string;
  controlledTo?: string;
  onControlledFromChange?: (v: string) => void;
  onControlledToChange?: (v: string) => void;
  exportFileTag?: string;
};

function formatEventType(type: string): string {
  return String(type || '').toLowerCase().replace(/_/g, ' ');
}

export function SupplierSettlementHistoryPanel({
  queryKeyPrefix,
  fetchEvents,
  branches,
  initialFrom,
  initialTo,
  controlledFrom,
  controlledTo,
  onControlledFromChange,
  onControlledToChange,
  exportFileTag = 'settlement-history',
}: SupplierSettlementHistoryPanelProps) {
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
    queryKey: [queryKeyPrefix, 'settlement-history', from, to, branchFilter || '__all__'],
    queryFn: () =>
      fetchEvents({
        from,
        to,
        branchId: branchFilter || undefined,
      }),
  });

  const rows = data?.events ?? [];

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        Date: new Date(row.createdAt).toLocaleString('en-ZA'),
        Branch: row.branchName || row.branchId,
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
    writeFile(wb, `${exportFileTag}-${from}-to-${to}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(12);
    doc.text(`Settlement history (${from} to ${to})`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [['Date', 'Branch', 'Order', 'Type', 'Gross', 'Commission', 'Net', 'Status', 'Gateway ref']],
      body: rows.map((row) => [
        new Date(row.createdAt).toLocaleString('en-ZA'),
        row.branchName || row.branchId,
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
    doc.save(`${exportFileTag}-${from}-to-${to}.pdf`);
  };

  return (
    <div className="card-elevated overflow-hidden">
      <div className="border-b border-border p-4 sm:p-6">
        <h2 className="text-lg font-semibold">History</h2>
        <p className="text-sm text-muted-foreground">Financial transactions and settlement activity across branches</p>
      </div>
      <div className="space-y-0 p-4 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-primary pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${queryKeyPrefix}-history-from`} className="text-xs text-muted-foreground">
                From Date
              </Label>
              <Input
                id={`${queryKeyPrefix}-history-from`}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full sm:w-[10.5rem]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${queryKeyPrefix}-history-to`} className="text-xs text-muted-foreground">
                To Date
              </Label>
              <Input
                id={`${queryKeyPrefix}-history-to`}
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full sm:w-[10.5rem]"
              />
            </div>
            {branches && branches.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Branch</Label>
                <Select value={branchFilter || '__all__'} onValueChange={(v) => setBranchFilter(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="w-full sm:w-[12rem]">
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
            )}
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
                    <th className="px-3 py-2">Branch</th>
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
                      <td className="px-3 py-2">{row.branchName || row.branchId.slice(0, 8)}</td>
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
  );
}
