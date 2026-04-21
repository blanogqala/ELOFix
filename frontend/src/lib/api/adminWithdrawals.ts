import apiClient from '@/api/client';

export interface AdminWithdrawalRow {
  id: string;
  providerId: string;
  amount: number;
  status: string;
  createdAt: string;
  providerName?: string;
  providerEmail?: string;
}

export async function listAdminWithdrawals(): Promise<{ success: boolean; withdrawals: AdminWithdrawalRow[] }> {
  const { data } = await apiClient.get<{ success: boolean; withdrawals: AdminWithdrawalRow[] }>('/admin/withdrawals');
  return data;
}

export async function approveAdminWithdrawal(id: string): Promise<{ success: boolean; withdrawal: AdminWithdrawalRow }> {
  const { data } = await apiClient.patch<{ success: boolean; withdrawal: AdminWithdrawalRow }>(
    `/admin/withdrawals/${id}/approve`
  );
  return data;
}

export async function markAdminWithdrawalPaid(id: string): Promise<{ success: boolean; withdrawal: AdminWithdrawalRow }> {
  const { data } = await apiClient.patch<{ success: boolean; withdrawal: AdminWithdrawalRow }>(
    `/admin/withdrawals/${id}/mark-paid`
  );
  return data;
}

export async function markAdminWithdrawalFailed(
  id: string,
  reason?: string
): Promise<{ success: boolean; withdrawal: AdminWithdrawalRow }> {
  const { data } = await apiClient.patch<{ success: boolean; withdrawal: AdminWithdrawalRow }>(
    `/admin/withdrawals/${id}/mark-failed`,
    { reason: reason ?? '' }
  );
  return data;
}
