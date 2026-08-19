import apiClient from '@/api/client';

export interface AdminOriginalCustomerPayment {
  paymentIntentId: string;
  amount: number;
  refundedAmount: number;
  gateway: string;
  gatewayTransactionId: string | null;
  merchantReference: string;
  paymentType: string | null;
  state: string;
}

export interface AdminRefundRepaymentRow {
  id: string;
  providerId: string;
  /** Submitted repayment amount (numeric; server-authoritative). */
  amount: number | null;
  submittedAmount: number | null;
  expectedAmount: number | null;
  difference?: number | null;
  amountMismatch?: boolean;
  amountMissing?: boolean;
  currency?: string;
  reference: string;
  proofUrl?: string | null;
  method?: string | null;
  gatewayTransactionId?: string | null;
  merchantReference?: string | null;
  paymentIntentId?: string | null;
  status: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  adminNote?: string | null;
  createdAt: string;
  refundObligationId?: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  obligationReference?: string | null;
  refundReason?: string | null;
  customerRefundStatus?: string | null;
  customerRefundPending?: number | null;
  originalCustomerPayments?: AdminOriginalCustomerPayment[];
  manualActionReason?: string | null;
  provider?: {
    blocked?: boolean;
    user?: { id: string; name: string; email: string } | null;
  } | null;
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
  body?: { adminNote?: string; acknowledgePartial?: boolean }
): Promise<{
  success: boolean;
  customerRefund?: { status?: string; results?: Array<{ jobId: string; status: string }> };
}> {
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

export async function processAdminCustomerRefund(
  id: string
): Promise<{ success: boolean; results?: Array<{ jobId: string; status: string }> }> {
  const { data } = await apiClient.post(`/admin/refund-repayments/${id}/process-customer-refund`);
  return data;
}
