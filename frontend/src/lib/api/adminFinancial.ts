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

export async function getAdminPaystackSettlementDiagnostic(params: {
  reference?: string;
  paymentIntentId?: string;
  lookbackDays?: number;
}): Promise<AdminPaystackSettlementDiagnostic> {
  const { data } = await apiClient.get<AdminPaystackSettlementDiagnostic>(
    '/admin/payments/paystack/settlement-diagnostic',
    { params }
  );
  return data;
}

export type AdminPaystackSettlementDiagnosticRow = {
  settlementId: string | null;
  status: string | null;
  settlementDate: string | null;
  currency: string | null;
  transactionCount: number;
  primaryTransactionCount?: number;
  fallbackAttempted?: boolean;
  fallbackTransactionCount?: number;
  transactionSource?: string | null;
  referenceMatched: boolean;
  matchedReference?: string;
  matchedTransactionStatus?: string | null;
  matchedTransactionFee?: number | null;
  mappedStatus?: string | null;
};

export type AdminPaystackSettlementDiagnostic = {
  success: boolean;
  paymentIntentId: string;
  merchantReference: string;
  paymentState: string;
  storedPayoutSettlementStatus: string | null;
  storedPayoutSettlementId: string | null;
  historicalSubaccountCode: string | null;
  resolvedNumericSubaccountId: number | null;
  settlementQuery: { from: string | null; to: string | null; pagesChecked: number };
  settlements: AdminPaystackSettlementDiagnosticRow[];
  reconciliationDecision: 'linked' | 'skipped';
  skipReason: string | null;
  apiError: {
    category: string;
    httpStatus: number | null;
    paystackErrorCode: string | null;
    message: string;
  } | null;
};

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
