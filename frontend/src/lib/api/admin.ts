import apiClient from '@/api/client';
import type { Supplier } from '@/types';

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
