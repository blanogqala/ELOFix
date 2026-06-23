import type { SupplierOrdersExportRow, SupplierOrdersExportSummary } from '@/lib/api/supplierPortal';

export type OrderStatusFilter = '__all__' | 'completed' | 'cancelled' | 'pending';

export type CompletedSubtotal = {
  count: number;
  revenue: number;
  commission: number;
  net: number;
};

export function rowStatusCategory(row: SupplierOrdersExportRow): 'completed' | 'cancelled' | 'pending' {
  if (row.isCancelled) return 'cancelled';
  if (row.isCompletedPaid || String(row.status || '').toUpperCase() === 'COMPLETED') return 'completed';
  return 'pending';
}

export function matchesStatusFilter(row: SupplierOrdersExportRow, filter: OrderStatusFilter): boolean {
  if (filter === '__all__') return true;
  return rowStatusCategory(row) === filter;
}

export function hasExportRowRefund(row: SupplierOrdersExportRow): boolean {
  if (!row.isCancelled) return false;
  const amt = Number(row.refundAmount ?? 0);
  if (Number.isFinite(amt) && amt > 0) return true;
  const rs = String(row.refundStatus || '').toLowerCase();
  return rs === 'processed' || rs === 'partial' || rs === 'gateway_failed' || rs === 'recorded';
}

export function computeCompletedSubtotal(rows: SupplierOrdersExportRow[]): CompletedSubtotal {
  return rows
    .filter((row) => rowStatusCategory(row) === 'completed')
    .reduce(
      (acc, row) => ({
        count: acc.count + 1,
        revenue: acc.revenue + Number(row.totalAmount || 0),
        commission: acc.commission + Number(row.commission || 0),
        net: acc.net + Number(row.netEarnings || 0),
      }),
      { count: 0, revenue: 0, commission: 0, net: 0 }
    );
}

export function computeActiveSubtotal(rows: SupplierOrdersExportRow[]): CompletedSubtotal {
  return rows
    .filter((row) => rowStatusCategory(row) !== 'cancelled')
    .reduce(
      (acc, row) => ({
        count: acc.count + 1,
        revenue: acc.revenue + Number(row.totalAmount || 0),
        commission: acc.commission + Number(row.commission || 0),
        net: acc.net + Number(row.netEarnings || 0),
      }),
      { count: 0, revenue: 0, commission: 0, net: 0 }
    );
}

export function computePendingSubtotal(rows: SupplierOrdersExportRow[]): CompletedSubtotal {
  return rows
    .filter((row) => rowStatusCategory(row) === 'pending')
    .reduce(
      (acc, row) => ({
        count: acc.count + 1,
        revenue: acc.revenue + Number(row.totalAmount || 0),
        commission: acc.commission + Number(row.commission || 0),
        net: acc.net + Number(row.netEarnings || 0),
      }),
      { count: 0, revenue: 0, commission: 0, net: 0 }
    );
}

/** Prefer API summary; fall back to row aggregation when active* fields are absent. */
export function resolveActiveSummary(
  summary: SupplierOrdersExportSummary,
  rows: SupplierOrdersExportRow[]
): CompletedSubtotal {
  if (typeof summary.activeRevenue === 'number') {
    return {
      count: (summary.completedCount ?? 0) + (summary.pendingCount ?? 0),
      revenue: summary.activeRevenue,
      commission: summary.activeCommission ?? 0,
      net: summary.activeNet ?? 0,
    };
  }
  return computeActiveSubtotal(rows);
}

export function summaryActiveGross(summary: SupplierOrdersExportSummary): number {
  const net = summary.activeNet ?? 0;
  const commission = summary.activeCommission ?? 0;
  return net + commission;
}
