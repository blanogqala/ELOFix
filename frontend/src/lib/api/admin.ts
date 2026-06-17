import apiClient from '@/api/client';
import type { Supplier } from '@/types';
import type { SupplierOrdersExportRow } from '@/lib/api/supplierPortal';

export interface AnalyticsDayPoint {
  date: string;
  count?: number;
  amount?: number;
}

export interface AdminAnalyticsResponse {
  success: boolean;
  from: string;
  to: string;
  jobsByDay: { date: string; count: number }[];
  revenueByDay: { date: string; amount: number }[];
  providersByDay: { date: string; count: number }[];
  summary: {
    totalJobs: number;
    totalRevenue: number;
    totalProviderSignupsInRange: number;
    activeApprovedProviders: number;
    totalLaborCommission?: number;
    totalMaterialCommission?: number;
    totalCommission?: number;
  };
}

export async function getAdminAnalytics(params?: { from?: string; to?: string }): Promise<AdminAnalyticsResponse> {
  const { data } = await apiClient.get<AdminAnalyticsResponse>('/admin/analytics', { params });
  return data;
}

export interface AdminCommissionsResponse {
  success: boolean;
  from: string;
  to: string;
  totalCommission: number;
  transactionCount: number;
  byDay: { date: string; amount: number }[];
}

/** Platform commission (ledger) for the date range — same source as per-job `commissionAmount` at settlement. */
export async function getAdminCommissions(params?: { from?: string; to?: string }): Promise<AdminCommissionsResponse> {
  const { data } = await apiClient.get<AdminCommissionsResponse>('/admin/commissions', { params });
  return data;
}

export interface AdminProviderRevenueSummaryRow {
  providerId: string;
  /** Provider share of completed + paid labor jobs (sum(job.providerAmount)). */
  netRevenue: number;
  /** Gross labor total including platform commission (sum(job.totalPrice)). */
  grossRevenue: number;
  /** Platform commission from completed + paid labor jobs (sum(job.commissionAmount)). */
  platformCommission: number;
  /** Count of completed + paid labor jobs. */
  completedJobCount: number;
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
  };
  financial: {
    totalEarnings: number;
    releasedByPlatform: number;
    availableToWithdraw: number;
    remainingInEscrow: number;
  };
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
  summary: {
    orderCount: number;
    cancelledCount: number;
    totalRevenueImpact: number;
    totalCommissionImpact: number;
    totalNetImpact: number;
  };
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    rows: SupplierOrdersExportRow[];
    summary: {
      orderCount: number;
      cancelledCount: number;
      totalRevenueImpact: number;
      totalCommissionImpact: number;
      totalNetImpact: number;
    };
  }>(`/admin/suppliers/${supplierId}/orders/export`, {
    params: {
      ...(filters?.from ? { from: filters.from } : {}),
      ...(filters?.to ? { to: filters.to } : {}),
      ...(filters?.branchId ? { branchId: filters.branchId } : {}),
    },
  });
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    summary: data?.summary || {
      orderCount: 0,
      cancelledCount: 0,
      totalRevenueImpact: 0,
      totalCommissionImpact: 0,
      totalNetImpact: 0,
    },
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
