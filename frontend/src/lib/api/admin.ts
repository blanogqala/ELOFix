import apiClient from '@/api/client';

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
