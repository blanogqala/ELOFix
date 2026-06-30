import apiClient from '@/api/client';

export interface AdminRefundRepaymentRow {
  id: string;
  providerId: string;
  amount: number;
  reference: string;
  proofUrl?: string | null;
  status: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  adminNote?: string | null;
  createdAt: string;
  provider?: {
    blocked?: boolean;
    user?: { id: string; name: string; email: string };
  };
}

export async function listAdminRefundRepayments(params?: {
  view?: 'reviews' | 'history';
  status?: string;
  search?: string;
}): Promise<{ success: boolean; repayments: AdminRefundRepaymentRow[] }> {
  const { data } = await apiClient.get<{ success: boolean; repayments: AdminRefundRepaymentRow[] }>(
    '/admin/refund-repayments',
    { params: params ?? {} }
  );
  return data;
}

export async function confirmAdminRefundRepayment(
  id: string,
  body?: { adminNote?: string }
): Promise<{ success: boolean }> {
  const { data } = await apiClient.post(`/admin/refund-repayments/${id}/confirm`, body ?? {});
  return data;
}

export async function rejectAdminRefundRepayment(
  id: string,
  body?: { adminNote?: string }
): Promise<{ success: boolean }> {
  const { data } = await apiClient.post(`/admin/refund-repayments/${id}/reject`, body ?? {});
  return data;
}
