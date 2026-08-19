import apiClient from '@/api/client';
import type { Supplier } from '@/types';
import type { SupplierOrdersExportRow, SupplierOrdersExportSummary } from '@/lib/api/supplierPortal';
import { EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY } from '@/lib/api/supplierPortal';

export interface AnalyticsDayPoint {
  date: string;
  count?: number;
  amount?: number;
}

export interface DisputesDayPoint {
  date: string;
  opened: number;
  resolved: number;
}

export interface AdminAnalyticsSummary {
  totalJobs: number;
  totalRevenue: number;
  totalProviderSignupsInRange: number;
  activeApprovedProviders: number;
  totalLaborCommission?: number;
  totalMaterialCommission?: number;
  totalCommission?: number;
  totalCustomers?: number;
  totalProviders?: number;
  verifiedProviders?: number;
  pendingVerification?: number;
  totalSuppliers?: number;
  openDisputes?: number;
  disputesOpenedInRange?: number;
  averageRating?: number;
  activeUsers?: number;
  escrowBalance?: number;
  deltas?: Record<string, number>;
}

export interface AdminAnalyticsResponse {
  success: boolean;
  from: string;
  to: string;
  jobsByDay: { date: string; count: number }[];
  revenueByDay: { date: string; amount: number }[];
  providersByDay: { date: string; count: number }[];
  customersByDay?: { date: string; count: number }[];
  suppliersByDay?: { date: string; count: number }[];
  disputesByDay?: DisputesDayPoint[];
  verificationQueueByDay?: { date: string; count: number }[];
  commissionByDay?: { date: string; amount: number }[];
  summary: AdminAnalyticsSummary;
}

export interface AdminAnalyticsParams {
  from?: string;
  to?: string;
  city?: string;
  province?: string;
  role?: string;
  category?: string;
  search?: string;
}

export async function getAdminAnalytics(params?: AdminAnalyticsParams): Promise<AdminAnalyticsResponse> {
  const { data } = await apiClient.get<AdminAnalyticsResponse>('/admin/analytics', { params });
  return data;
}

export interface AdminAnalyticsFilterOptions {
  success: boolean;
  cities: string[];
  provinces: string[];
  categories: string[];
}

export async function getAdminAnalyticsFilterOptions(): Promise<AdminAnalyticsFilterOptions> {
  const { data } = await apiClient.get<AdminAnalyticsFilterOptions>('/admin/analytics/filter-options');
  return data;
}

export type PlatformHealthStatus = 'healthy' | 'degraded' | 'down';

export interface PlatformHealthComponent {
  id: string;
  label: string;
  status: PlatformHealthStatus;
  detail: string;
  latencyMs?: number;
}

export interface AdminPlatformHealthResponse {
  success: boolean;
  checkedAt: string;
  components: PlatformHealthComponent[];
}

export async function getAdminPlatformHealth(): Promise<AdminPlatformHealthResponse> {
  const { data } = await apiClient.get<AdminPlatformHealthResponse>('/admin/platform-health');
  return data;
}

export interface AdminCommissionsResponse {
  success: boolean;
  from: string;
  to: string;
  /** Labor commission from all paid jobs (matches Providers tab). */
  totalLaborCommission?: number;
  /** Material commission from all paid orders (matches Suppliers tab). */
  totalMaterialCommission?: number;
  /** totalLaborCommission + totalMaterialCommission */
  totalCommission: number;
  transactionCount: number;
  byDay: { date: string; amount: number }[];
}

/** Platform commission: labor (completed jobs) + materials (completed orders). */
export async function getAdminCommissions(params?: { from?: string; to?: string }): Promise<AdminCommissionsResponse> {
  const { data } = await apiClient.get<AdminCommissionsResponse>('/admin/commissions', { params });
  return data;
}

export interface AdminCustomerPaymentObligationRow {
  id: string;
  customerId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  jobId: string;
  jobTitle?: string | null;
  amountDue: number;
  dueAt: string;
  status: string;
  displayStatus?: string;
  marketplaceRestricted?: boolean;
}

export interface AdminProviderRefundDebtRow {
  id: string;
  providerId: string;
  providerUserId?: string | null;
  providerName?: string | null;
  providerEmail?: string | null;
  jobId: string | null;
  jobTitle?: string | null;
  amountDue: number;
  dueAt: string;
  status: string;
  restrictionActive?: boolean;
}

export async function getAdminPaymentObligations(params?: {
  overdueOnly?: boolean;
  status?: string;
}): Promise<{
  success: boolean;
  customerObligations: AdminCustomerPaymentObligationRow[];
  providerRefundDebts: AdminProviderRefundDebtRow[];
}> {
  const { data } = await apiClient.get('/admin/payment-obligations', { params });
  return {
    success: Boolean(data?.success),
    customerObligations: Array.isArray(data?.customerObligations) ? data.customerObligations : [],
    providerRefundDebts: Array.isArray(data?.providerRefundDebts) ? data.providerRefundDebts : [],
  };
}

export interface AdminProviderRevenueSummaryRow {
  providerId: string;
  /** Provider share of completed + paid labor jobs (sum(job.providerAmount)). */
  netRevenue: number;
  /** Gross labor: active + completed paid, plus provider released + 7% on partial cancelled. */
  grossRevenue: number;
  /** Platform commission on the same job set (full 7% kept when provider had a release). */
  platformCommission: number;
  /** Count of completed + paid labor jobs. */
  completedJobCount: number;
  /** Count of all labor-paid jobs except cancelled (active + completed). */
  paidJobCount: number;
}

export interface AdminProviderRevenueSummaryResponse {
  success: boolean;
  revenues: AdminProviderRevenueSummaryRow[];
}

/** Admin-only: provider net revenue broken down per providerId. */
export async function getAdminProviderRevenueSummary(): Promise<AdminProviderRevenueSummaryResponse> {
  const { data } = await apiClient.get<AdminProviderRevenueSummaryResponse>('/admin/providers/revenue-summary');
  return data;
}

export interface AdminProviderAnalytics {
  jobCounts: {
    total: number;
    completed: number;
    active: number;
    pending: number;
    cancelled: number;
    disputed: number;
  };
  financial: {
    totalEarnings: number;
    releasedByPlatform: number;
    availableToWithdraw: number;
    remainingInEscrow: number;
  };
}

export async function getAdminProviderPayoutProfile(userId: string): Promise<{
  success: boolean;
  profile: AdminPayoutProfileRow | null;
  gatewaySettlementSupported: boolean;
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    profile: AdminPayoutProfileRow | null;
    gatewaySettlementSupported: boolean;
  }>(`/admin/providers/${encodeURIComponent(userId)}/payout-profile`);
  return data;
}

export interface AdminPayoutProfileRow {
  scope?: string;
  entityId?: string;
  bankName?: string;
  accountHolder?: string;
  accountType?: string | null;
  accountNumberMasked?: string;
  branchCodeMasked?: string;
  verificationStatus?: string;
  gatewaySettlementProfile?: {
    status?: string | null;
    provider?: string | null;
    recipientConfigured?: boolean;
  };
  isActive?: boolean;
  updatedAt?: string;
  branchName?: string | null;
  businessName?: string | null;
}

export async function getAdminBranchPayoutProfile(
  supplierId: string,
  branchId: string
): Promise<{
  success: boolean;
  profile: AdminPayoutProfileRow | null;
  gatewaySettlementSupported: boolean;
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    profile: AdminPayoutProfileRow | null;
    gatewaySettlementSupported: boolean;
  }>(
    `/admin/suppliers/${encodeURIComponent(supplierId)}/branches/${encodeURIComponent(branchId)}/payout-profile`
  );
  return data;
}

export async function getAdminProviderAnalytics(userId: string): Promise<AdminProviderAnalytics> {
  const { data } = await apiClient.get<{ success: boolean; analytics: AdminProviderAnalytics }>(
    `/admin/providers/${userId}/analytics`,
  );
  if (!data?.analytics) throw new Error('Failed to load provider analytics');
  return data.analytics;
}

/** Material-order analytics: completed + paid only; commission = commissionRate × totalRevenue. */
export interface AdminSupplierOrderAnalytics {
  orderCount: number;
  totalRevenue: number;
  totalCommission: number;
  averageOrderValue: number;
  commissionRate: number;
}

export interface AdminGlobalSupplierAnalytics extends AdminSupplierOrderAnalytics {
  totalSuppliers: number;
}

export async function getAdminSuppliers(): Promise<{
  suppliers: Supplier[];
  globalSupplierOrderAnalytics: AdminGlobalSupplierAnalytics;
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    suppliers: Supplier[];
    globalSupplierOrderAnalytics: AdminGlobalSupplierAnalytics;
  }>('/admin/suppliers');
  return {
    suppliers: Array.isArray(data?.suppliers) ? data.suppliers : [],
    globalSupplierOrderAnalytics:
      data?.globalSupplierOrderAnalytics ?? {
        totalSuppliers: 0,
        orderCount: 0,
        totalRevenue: 0,
        totalCommission: 0,
        averageOrderValue: 0,
        commissionRate: 0.07,
      },
  };
}

/** Admin provisions supplier login + org + default branch (JWT + ADMIN role). */
export async function provisionAdminSupplier(payload: {
  email: string;
  password: string;
  name?: string;
  businessName?: string;
  phone?: string;
  address?: string;
}): Promise<Supplier> {
  const { data } = await apiClient.post<{ success: boolean; supplier: Supplier | null }>(
    '/admin/suppliers',
    payload
  );
  if (!data?.supplier) throw new Error('Failed to provision supplier');
  return data.supplier;
}

export async function getAdminSupplierDetail(supplierId: string): Promise<{
  supplier: Supplier & {
    linkedUserEmail?: string | null;
    linkedUserId?: string | null;
  };
  analytics: AdminSupplierOrderAnalytics;
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    supplier: Supplier & { linkedUserEmail?: string | null; linkedUserId?: string | null };
    analytics: AdminSupplierOrderAnalytics;
  }>(`/admin/suppliers/${supplierId}`);
  if (!data?.supplier) {
    throw new Error('Supplier not found');
  }
  return { supplier: data.supplier, analytics: data.analytics };
}

export interface AdminSupplierOrderRow {
  id: string;
  userId?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  materialsSubtotal?: number;
  platformCommission?: number;
  supplierEarning?: number;
  total?: number;
  items?: unknown[];
  createdAt?: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string | null;
}

export async function getAdminSupplierMaterialOrders(supplierId: string): Promise<AdminSupplierOrderRow[]> {
  const { data } = await apiClient.get<{ success: boolean; orders: AdminSupplierOrderRow[] }>(
    `/admin/suppliers/${supplierId}/material-orders`
  );
  return Array.isArray(data?.orders) ? data.orders : [];
}

export async function getAdminSupplierOrders(supplierId: string, limit = 10): Promise<AdminSupplierOrderRow[]> {
  const { data } = await apiClient.get<{ success: boolean; orders: AdminSupplierOrderRow[] }>(
    `/admin/suppliers/${supplierId}/orders`,
    { params: { limit } }
  );
  return Array.isArray(data?.orders) ? data.orders : [];
}

/** Same payload as supplier portal `GET /supplier/orders/export` — completed/paid revenue rules + branch metadata. */
export async function getAdminSupplierOrdersExport(
  supplierId: string,
  filters?: { from?: string; to?: string; branchId?: string }
): Promise<{
  rows: SupplierOrdersExportRow[];
  summary: SupplierOrdersExportSummary;
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    rows: SupplierOrdersExportRow[];
    summary: SupplierOrdersExportSummary;
  }>(`/admin/suppliers/${supplierId}/orders/export`, {
    params: {
      ...(filters?.from ? { from: filters.from } : {}),
      ...(filters?.to ? { to: filters.to } : {}),
      ...(filters?.branchId ? { branchId: filters.branchId } : {}),
    },
  });
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    summary: data?.summary || { ...EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY },
  };
}

export interface AdminSupplierBranchWithdrawalRow {
  id: string;
  branchId: string;
  branchName: string;
  amount: number;
  status: string;
  createdAt: string;
}

import type { BranchSettlementEventRow } from '@/lib/api/supplierPortal';

export async function getAdminSupplierSettlementHistory(
  supplierId: string,
  filters?: { from?: string; to?: string; branchId?: string }
): Promise<{ success: boolean; events: BranchSettlementEventRow[] }> {
  const { data } = await apiClient.get<{ success: boolean; events: BranchSettlementEventRow[] }>(
    `/admin/suppliers/${encodeURIComponent(supplierId)}/branch-withdrawals`,
    {
      params: {
        ...(filters?.from ? { from: filters.from } : {}),
        ...(filters?.to ? { to: filters.to } : {}),
        ...(filters?.branchId ? { branchId: filters.branchId } : {}),
      },
    }
  );
  return {
    success: Boolean(data?.success),
    events: Array.isArray(data?.events) ? data.events : [],
  };
}

export async function getAdminSupplierSettlementSummary(
  supplierId: string,
  filters?: { from?: string; to?: string }
): Promise<{
  totalPendingSettlement: number;
  totalSettled: number;
  gatewaySettlementSupported?: boolean;
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    totalPendingSettlement?: number;
    totalSettled?: number;
    gatewaySettlementSupported?: boolean;
  }>(`/admin/suppliers/${encodeURIComponent(supplierId)}/settlement-summary`, {
    params: {
      ...(filters?.from ? { from: filters.from } : {}),
      ...(filters?.to ? { to: filters.to } : {}),
    },
  });
  return {
    totalPendingSettlement: Number(data?.totalPendingSettlement ?? 0),
    totalSettled: Number(data?.totalSettled ?? 0),
    gatewaySettlementSupported: Boolean(data?.gatewaySettlementSupported),
  };
}

/** @deprecated use getAdminSupplierSettlementSummary */
export async function getAdminSupplierAvailableWithdrawals(
  supplierId: string,
  filters?: { from?: string; to?: string }
): Promise<{ totalAvailableWithdrawals: number }> {
  const summary = await getAdminSupplierSettlementSummary(supplierId, filters);
  return { totalAvailableWithdrawals: summary.totalPendingSettlement };
}

/** @deprecated use getAdminSupplierSettlementHistory */
export async function getAdminSupplierBranchWithdrawals(
  supplierId: string,
  filters?: { from?: string; to?: string; branchId?: string }
): Promise<{ success: boolean; withdrawals: AdminSupplierBranchWithdrawalRow[] }> {
  const { events } = await getAdminSupplierSettlementHistory(supplierId, filters);
  return {
    success: true,
    withdrawals: events.map((e) => ({
      id: e.id,
      branchId: e.branchId,
      branchName: e.branchName || '',
      amount: e.netAmount,
      status: e.settlementStatus,
      createdAt: e.createdAt,
    })),
  };
}

/** All platform material orders + revenue / commission rollup (persisted MaterialOrder rows). */
export async function getAdminPlatformMaterialOrders(limit?: number) {
  const { data } = await apiClient.get<{
    success: boolean;
    orders: AdminSupplierOrderRow[];
    summary: {
      orderCount: number;
      totalMaterialsRevenue: number;
      platformCommissionTotal: number;
    };
  }>('/admin/material-orders', { params: limit != null ? { limit } : undefined });
  return data;
}
