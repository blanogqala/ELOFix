import apiClient from '@/api/client';

export interface FinancialSummary {
  totalPlatformVolume: number;
  breakdown: {
    releasedToBalance: number;
    paidOutDebits: number;
  };
  totalPendingPayouts: number;
  pendingWithdrawalRequests: number;
  approvedWithdrawalRequests: number;
  totalCompletedPayouts: number;
}

export async function getAdminFinancialSummary(): Promise<{ success: boolean; summary: FinancialSummary }> {
  const { data } = await apiClient.get<{ success: boolean; summary: FinancialSummary }>('/admin/financial-summary');
  return data;
}

export async function reconcileAdminProvider(providerId: string): Promise<{
  success: boolean;
  ok: boolean;
  details: Record<string, unknown>;
}> {
  const { data } = await apiClient.get(`/admin/reconcile/${encodeURIComponent(providerId)}`);
  return data;
}
