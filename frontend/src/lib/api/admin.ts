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

export async function getAdminSuppliers(): Promise<Supplier[]> {
  const { data } = await apiClient.get<{ success: boolean; suppliers: Supplier[] }>('/admin/suppliers');
  return Array.isArray(data?.suppliers) ? data.suppliers : [];
}

export interface AdminSupplierOrderRow {
  id: string;
  userId?: string;
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
