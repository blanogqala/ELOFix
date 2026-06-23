import apiClient from '@/api/client';

function idempotencyHeaders(): { 'Idempotency-Key': string } {
  const uuid =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { 'Idempotency-Key': uuid };
}

export interface ProviderEarningJobRow {
  id: string;
  title: string;
  category: string;
  amount: number;
  status: string;
  laborPaid: boolean;
  paymentReleased: boolean;
  createdAt: string;
  /** Optional: if API adds explicit job total distinct from `amount` */
  totalPrice?: number;
  commissionAmount?: number;
  providerAmount?: number;
  /** Cumulative amount released to provider (not platform fee) */
  releasedAmount?: number;
  /** Provider share not yet released */
  remainingAmount?: number;
  /** Optional: may appear on list payload or only on single-job earnings fetch */
  customerName?: string;
  /** Frontend workflow status from job meta (e.g. DISPUTED, IN_PROGRESS) */
  workflowStatus?: string;
  refundAmount?: number;
  refundStatus?: string;
  refundDetails?: {
    customerNet?: number;
    materialsNet?: number;
    escrowApplied?: number;
    clawbackApplied?: number;
    providerDebtAdded?: number;
    cumulativeCustomerNet?: number;
    processedAt?: string | null;
  };
  providerRefundDebt?: number;
  clawbackFromReleased?: number;
  escrowReversed?: number;
  netReleasedAfterRefund?: number;
}

export interface ProviderEarningsResponse {
  success: boolean;
  summary: ProviderEarningsSummary;
  jobs: ProviderEarningJobRow[];
}

/** Bank details returned from API — account and branch are masked only. */
export interface WithdrawalProfile {
  id: string;
  providerId: string;
  bankName: string;
  accountHolder: string;
  accountNumberMasked: string;
  branchCodeMasked: string;
  updatedAt: string;
}

export interface ProviderBalanceSnapshot {
  available: number;
  pending: number;
  withdrawn: number;
  refundDebtOwed?: number;
  totalClawback?: number;
}

export interface ProviderEarningsSummary {
  totalReleased: number;
  withdrawn: number;
  pendingWithdrawals: number;
  available: number;
  refundDebtOwed?: number;
  totalClawback?: number;
}

export interface ProviderWithdrawalRow {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface ProviderTransactionRow {
  id: string;
  kind: 'withdrawal' | 'refund_clawback' | 'refund_debt' | 'debt_recovery';
  amount: number;
  status?: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  createdAt: string;
  description: string;
}

export async function getProviderBalance(): Promise<{ success: boolean } & ProviderBalanceSnapshot> {
  const { data } = await apiClient.get<{ success: boolean } & ProviderBalanceSnapshot>('/provider/balance');
  return data;
}

export async function getProviderEarnings(): Promise<ProviderEarningsResponse> {
  const { data } = await apiClient.get<ProviderEarningsResponse>('/provider/earnings');
  return data;
}

export async function getProviderEarningJob(jobId: string): Promise<{
  success: boolean;
  job: ProviderEarningJobRow & { customerName?: string };
}> {
  const { data } = await apiClient.get(`/provider/earnings/${jobId}`);
  return data;
}

export async function getWithdrawalProfile(): Promise<{ success: boolean; profile: WithdrawalProfile | null }> {
  const { data } = await apiClient.get('/provider/withdrawal-profile');
  return data;
}

export async function saveWithdrawalProfile(body: {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branchCode: string;
}): Promise<{ success: boolean; profile: WithdrawalProfile }> {
  const { data } = await apiClient.put('/provider/withdrawal-profile', body);
  return data;
}

export async function requestWithdrawal(amount: number): Promise<{
  success: boolean;
  withdrawal: { id: string; amount: number; status: string; createdAt: string };
}> {
  const { data } = await apiClient.post('/provider/withdraw', { amount }, { headers: idempotencyHeaders() });
  return data;
}

export async function getProviderTransactions(): Promise<{
  success: boolean;
  transactions: ProviderTransactionRow[];
}> {
  const { data } = await apiClient.get<{ success: boolean; transactions: ProviderTransactionRow[] }>(
    '/provider/transactions'
  );
  return data;
}

export async function getProviderWithdrawals(): Promise<{
  success: boolean;
  withdrawals: ProviderWithdrawalRow[];
}> {
  const { data } = await apiClient.get<{ success: boolean; withdrawals: ProviderWithdrawalRow[] }>(
    '/provider/withdrawals'
  );
  return data;
}
