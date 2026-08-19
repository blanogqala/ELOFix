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
  /** Provider share not yet released (legacy escrow only) */
  remainingAmount?: number;
  /** Optional: may appear on list payload or only on single-job earnings fetch */
  customerName?: string;
  /** Frontend workflow status from job meta (e.g. DISPUTED, IN_PROGRESS) */
  workflowStatus?: string;
  courierFlow?: boolean;
  fulfillmentStatus?: string | null;
  deliveryPaid?: boolean;
  paymentProgress?: string;
  paymentLabel?: string;
  legacyEscrowV2?: boolean;
  customerPaidTotal?: number | null;
  customerRemaining?: number | null;
  providerShareRecorded?: number;
  providerShareRemaining?: number;
  refundAmount?: number;
  refundStatus?: string;
  refundDetails?: {
    customerNet?: number;
    materialsNet?: number;
    escrowApplied?: number;
    clawbackApplied?: number;
    providerDebtAdded?: number;
    immediateRefund?: number;
    pendingRefund?: number;
    cumulativeCustomerNet?: number;
    processedAt?: string | null;
  };
  providerRefundDebt?: number;
  clawbackFromReleased?: number;
  escrowReversed?: number;
  netReleasedAfterRefund?: number;
  completionPayment?: {
    status?: string;
    amount?: number;
  } | null;
  completionPaymentDue?: {
    amountDue: number;
    dueAt?: string | null;
    status?: string;
    obligationId?: string | null;
    source?: string | null;
    resolutionLogId?: string | null;
    createdAt?: string | null;
    notifiedAt?: string | null;
  } | null;
}

export interface ProviderSettlementRecord {
  id: string;
  jobId: string | null;
  jobTitle?: string | null;
  jobCategory?: string | null;
  customerName?: string | null;
  paymentType: string | null;
  customerAmount: number;
  commissionAmount: number;
  providerShare: number;
  merchantReference: string;
  paidAt: string;
}

export interface ProviderEarningsResponse {
  success: boolean;
  summary: ProviderEarningsSummary;
  jobs: ProviderEarningJobRow[];
  settlementRecords?: ProviderSettlementRecord[];
}

/** Bank details returned from API — account and branch are masked only. */
export type WithdrawalAccountType = 'CHEQUE' | 'SAVINGS' | 'CURRENT';
export type PayoutVerificationStatus =
  | 'NOT_CONFIGURED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'ACTION_REQUIRED'
  | 'REJECTED'
  | 'SUSPENDED';

export interface WithdrawalProfile {
  id: string;
  providerId: string;
  bankName: string;
  accountHolder: string;
  accountNumberMasked: string;
  branchCodeMasked: string;
  accountType?: WithdrawalAccountType | string | null;
  verificationStatus?: PayoutVerificationStatus | string | null;
  verifiedAt?: string | null;
  gatewaySettlementProfile?: {
    status?: string | null;
    provider?: string | null;
    recipientConfigured?: boolean;
  };
  isActive?: boolean;
  updatedAt: string;
}

export interface PayoutProfileResponse {
  success: boolean;
  profile: WithdrawalProfile | null;
  verificationStatus?: PayoutVerificationStatus;
  gatewaySettlementSupported?: boolean;
  canRemove?: boolean;
  removeBlockedReason?: string;
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
  /** Raw ledger pending credits (legacy Earning wallet). */
  pending?: number;
  /** Legacy escrow unreleased only. */
  providerEscrowRemaining?: number;
  /** SUM provider share from successful customer payments. */
  totalProviderShareRecorded?: number;
  /** Provider share still tied to unpaid payment stages. */
  totalProviderShareRemaining?: number;
  hasLegacyJobs?: boolean;
}

export interface ProviderWithdrawalRow {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface ProviderTransactionRow {
  id: string;
  kind: 'withdrawal' | 'refund_clawback' | 'refund_debt' | 'debt_recovery' | 'refund_escrow_reversal';
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

export async function getWithdrawalProfile(): Promise<PayoutProfileResponse> {
  const { data } = await apiClient.get<PayoutProfileResponse>('/provider/withdrawal-profile');
  return data;
}

type SavePayoutBody = {
  bankName: string;
  accountHolder: string;
  accountNumber?: string;
  branchCode?: string;
  accountType?: WithdrawalAccountType | string;
  confirmReplace?: boolean;
};

export async function saveWithdrawalProfile(body: SavePayoutBody): Promise<PayoutProfileResponse> {
  const { data } = await apiClient.put<PayoutProfileResponse>('/provider/withdrawal-profile', body);
  return data;
}

export async function replaceWithdrawalProfile(body: SavePayoutBody & { confirmReplace: true }): Promise<PayoutProfileResponse> {
  const { data } = await apiClient.put<PayoutProfileResponse>('/provider/withdrawal-profile/replace', body);
  return data;
}

export async function removeWithdrawalProfile(): Promise<PayoutProfileResponse> {
  const { data } = await apiClient.delete<PayoutProfileResponse>('/provider/withdrawal-profile');
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

export type ProviderRepaymentStatus =
  | 'REFUND_DUE'
  | 'AWAITING_VERIFICATION'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_VERIFIED'
  | 'REFUND_PROCESSING'
  | 'REFUNDED'
  | 'OVERDUE'
  | string;

export interface ProviderRefundRecoveryRow {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  customerId?: string | null;
  customerName?: string | null;
  totalPending: number;
  recoveredAmount: number;
  balance: number;
  status: string;
  repaymentStatus?: ProviderRepaymentStatus;
  dueAt: string;
  reference: string;
  customerRefundPending?: number;
  customerRefundImmediate?: number;
  refundStatus?: string | null;
}

export interface ProviderRefundDebtSummary {
  totalOwed: number;
  dueAt: string | null;
  reference: string | null;
  repaymentStatus?: ProviderRepaymentStatus;
  platformBank: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    branchCode: string;
    accountType: string;
  };
  pendingRepayment?: {
    id: string;
    amount: number;
    reference: string;
    status: string;
    jobId?: string | null;
    createdAt: string;
  } | null;
  lastRejectedRepayment?: {
    amount: number;
    reference: string;
    adminNote?: string | null;
    reviewedAt?: string | null;
  } | null;
  recoveries: ProviderRefundRecoveryRow[];
}

export interface ProviderJobRefundObligation {
  jobId: string;
  jobTitle: string | null;
  customerId: string;
  customerName: string | null;
  amountDue: number;
  dueAt: string | null;
  reference: string | null;
  repaymentStatus: ProviderRepaymentStatus;
  recoveryStatus: string | null;
  customerRefundPending: number;
  customerRefundImmediate: number;
  refundStatus: string | null;
  customerRefundStatus?: string | null;
  platformBank: ProviderRefundDebtSummary['platformBank'];
  pendingRepayment: ProviderRefundDebtSummary['pendingRepayment'];
  lastRejectedRepayment: ProviderRefundDebtSummary['lastRejectedRepayment'];
  recoveries: ProviderRefundRecoveryRow[];
  totalOwed: number;
}

export async function getProviderRefundDebt(): Promise<{ success: boolean } & ProviderRefundDebtSummary> {
  const { data } = await apiClient.get<{ success: boolean } & ProviderRefundDebtSummary>(
    '/provider/refund-debt'
  );
  return data;
}

export async function getProviderJobRefundObligation(
  jobId: string
): Promise<{ success: boolean; obligation: ProviderJobRefundObligation }> {
  const { data } = await apiClient.get<{ success: boolean; obligation: ProviderJobRefundObligation }>(
    `/provider/jobs/${jobId}/refund-obligation`
  );
  return data;
}

export async function createProviderRefundRepaymentCheckout(
  jobId: string,
  body?: { amount?: number; provider?: string }
): Promise<{
  success: boolean;
  repaymentId: string;
  intentId: string;
  amount: number;
  provider: string;
  merchantReference: string;
  checkout: {
    type: string;
    url: string;
    method?: string;
    formFields?: Record<string, string>;
  };
  status: string;
}> {
  const { data } = await apiClient.post(`/provider/jobs/${jobId}/refund-obligation/checkout`, body ?? {}, {
    headers: idempotencyHeaders(),
  });
  return data;
}

export async function submitProviderRefundRepayment(body: {
  amount?: number;
  reference: string;
  proofUrl?: string;
  jobId?: string;
}): Promise<{ success: boolean; repayment: { id: string; status: string; amount?: number } }> {
  const { data } = await apiClient.post('/provider/refund-debt/repayments', body, {
    headers: idempotencyHeaders(),
  });
  return data;
}
