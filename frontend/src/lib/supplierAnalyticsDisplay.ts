import type { SupplierAnalyticsOverview, SupplierBranchAnalyticsRow } from '@/lib/api/supplierPortal';

export function supplierOverviewGrossRevenue(
  overview: SupplierAnalyticsOverview | null | undefined
): number | null {
  if (!overview) return null;
  if (overview.sumGrossRevenueAllBranches != null && overview.sumGrossRevenueAllBranches > 0) {
    return overview.sumGrossRevenueAllBranches;
  }
  const net = overview.sumNetEarningsAllBranches ?? 0;
  const commission = overview.sumPlatformCommissionAllBranches ?? 0;
  if (net + commission > 0) return net + commission;
  return net;
}

export function supplierBranchGrossRevenue(branch: SupplierBranchAnalyticsRow): number {
  if (branch.grossRevenue != null && branch.grossRevenue >= 0) return branch.grossRevenue;
  const net = branch.netEarnings ?? 0;
  const commission = branch.platformCommission ?? 0;
  return net + commission;
}

export const SUPPLIER_GROSS_EARNINGS_LABEL = 'Net earning + 7% commission';
export const SUPPLIER_GROSS_EARNINGS_HINT = 'Excluding cancelled';
