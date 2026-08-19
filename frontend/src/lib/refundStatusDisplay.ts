/**
 * Shared provider/customer refund status display derived from backend fields.
 * Do not invent parallel enums — map obligation + job.meta.refund fields.
 */

export type ProviderRefundDisplayMode =
  | 'hidden'
  | 'required'
  | 'awaiting_verification'
  | 'rejected'
  | 'overdue'
  | 'verified_pending_customer'
  | 'customer_processing'
  | 'customer_completed';

export type ProviderRefundDisplayInput = {
  amountDue?: number | null;
  pendingRepayment?: { id?: string; status?: string; jobId?: string | null } | null;
  repaymentStatus?: string | null;
  customerRefundStatus?: string | null;
  /** Optional: current job id to ignore unrelated provider-wide SUBMITTED repayments */
  jobId?: string | null;
};

function norm(s: string | null | undefined): string {
  return String(s || '').trim().toUpperCase();
}

export function resolveProviderRefundDisplay(
  input: ProviderRefundDisplayInput
): { mode: ProviderRefundDisplayMode; label: string; showRepayCta: boolean } {
  const crs = norm(input.customerRefundStatus);
  const rs = norm(input.repaymentStatus);
  const amountDue = Number(input.amountDue) || 0;
  const pending = input.pendingRepayment;
  const pendingStatus = norm(pending?.status || (pending ? 'SUBMITTED' : ''));
  const pendingJobId = pending?.jobId != null ? String(pending.jobId) : null;
  const jobId = input.jobId != null ? String(input.jobId) : null;

  const pendingAppliesToJob =
    Boolean(pending) &&
    pendingStatus === 'SUBMITTED' &&
    (!jobId || !pendingJobId || pendingJobId === jobId);

  if (crs === 'REFUND_COMPLETED') {
    return { mode: 'customer_completed', label: 'Customer refund completed', showRepayCta: false };
  }
  if (crs === 'REFUND_REQUESTED' || crs === 'REFUND_PROCESSING') {
    return {
      mode: 'customer_processing',
      label: 'Repayment verified — customer refund processing',
      showRepayCta: false,
    };
  }
  if (crs === 'REFUND_MANUAL_ACTION_REQUIRED') {
    return {
      mode: 'customer_processing',
      label: 'Repayment verified — customer refund processing',
      showRepayCta: false,
    };
  }
  if (crs === 'REFUND_FAILED') {
    return {
      mode: 'customer_processing',
      label: 'Customer refund delayed — EloFix is following up',
      showRepayCta: false,
    };
  }
  if (crs === 'READY' || crs === 'REFUND_READY') {
    return {
      mode: 'verified_pending_customer',
      label: 'Repayment verified — customer refund pending',
      showRepayCta: false,
    };
  }

  if (rs === 'REFUNDED' && amountDue <= 0 && !pendingAppliesToJob) {
    return { mode: 'customer_completed', label: 'Customer refund completed', showRepayCta: false };
  }
  if (rs === 'REFUND_PROCESSING' && amountDue <= 0) {
    return {
      mode: 'verified_pending_customer',
      label: 'Repayment verified — customer refund pending',
      showRepayCta: false,
    };
  }

  if (pendingAppliesToJob && (amountDue > 0 || !crs)) {
    return {
      mode: 'awaiting_verification',
      label: 'Repayment submitted — awaiting EloFix verification',
      showRepayCta: false,
    };
  }

  if (rs === 'AWAITING_VERIFICATION' && amountDue > 0) {
    return {
      mode: 'awaiting_verification',
      label: 'Repayment submitted — awaiting EloFix verification',
      showRepayCta: false,
    };
  }

  if (rs === 'PAYMENT_REJECTED' && amountDue > 0) {
    return {
      mode: 'rejected',
      label: 'Repayment rejected — resubmit',
      showRepayCta: true,
    };
  }

  if (rs === 'OVERDUE' && amountDue > 0) {
    return {
      mode: 'overdue',
      label: 'Overdue — payment required',
      showRepayCta: true,
    };
  }

  if (amountDue > 0) {
    return {
      mode: 'required',
      label: 'Refund required',
      showRepayCta: true,
    };
  }

  return { mode: 'hidden', label: '', showRepayCta: false };
}

/** Customer-facing refund display from job DTO fields. */
export type CustomerRefundDisplayMode = 'none' | 'pending' | 'processing' | 'completed' | 'failed';

const CUSTOMER_REFUND_PROCESSING_STATUSES = new Set([
  'READY',
  'REFUND_READY',
  'REFUND_REQUESTED',
  'REFUND_PROCESSING',
  'REFUND_MANUAL_ACTION_REQUIRED',
]);

export function resolveCustomerRefundDisplay(job: {
  refundAmount?: number | null;
  refundStatus?: string | null;
  customerRefundStatus?: string | null;
  refundDetails?: { pendingRefund?: number; immediateRefund?: number } | null;
  refundCompletedAt?: string | null;
}): {
  mode: CustomerRefundDisplayMode;
  label: string;
  amount: number;
  completedAt?: string | null;
} {
  const crs = norm(job.customerRefundStatus);
  const pending = Number(job.refundDetails?.pendingRefund) || 0;
  const immediate = Number(job.refundDetails?.immediateRefund) || 0;
  const total =
    Number(job.refundAmount) ||
    immediate + pending ||
    0;
  const completedAt = job.refundCompletedAt || null;

  if (crs === 'REFUND_COMPLETED' || (isLegacyProcessed(job.refundStatus) && pending <= 0 && total > 0)) {
    return {
      mode: 'completed',
      label: 'Refunded',
      amount: total > 0 ? total : immediate,
      completedAt,
    };
  }
  if (crs === 'REFUND_FAILED') {
    return { mode: 'failed', label: 'Refund delayed', amount: total, completedAt: null };
  }
  // Provider repayment is verified; EloFix still needs to pay the customer.
  if (CUSTOMER_REFUND_PROCESSING_STATUSES.has(crs)) {
    return {
      mode: 'processing',
      label: 'Refund processing',
      amount: pending > 0 ? pending : total,
      completedAt: null,
    };
  }
  if (pending > 0 || isLegacyPending(job.refundStatus)) {
    return {
      mode: 'pending',
      label: 'Refund pending',
      amount: pending > 0 ? pending : total,
      completedAt: null,
    };
  }
  if (total > 0 && isLegacyProcessed(job.refundStatus)) {
    return { mode: 'completed', label: 'Refunded', amount: total, completedAt };
  }
  return { mode: 'none', label: '', amount: 0, completedAt: null };
}

function isLegacyProcessed(status?: string | null): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'processed' || s === 'partial';
}

function isLegacyPending(status?: string | null): boolean {
  const s = String(status || '').toLowerCase();
  return (
    s === 'recorded' ||
    s === 'pending' ||
    s === 'partial_pending_recovery' ||
    s === 'pending_manual_gateway'
  );
}

/** Notification types that light the customer Payments orange dot (completion only). */
export const REFUND_BLOCKS_DELETE_MSG =
  'This job cannot be removed until the pending refund is fully settled.';

export function getRefundBlocksDeleteMessage(): string {
  return REFUND_BLOCKS_DELETE_MSG;
}

export function isJobRefundUnsettled(job: {
  refundAmount?: number | null;
  refundStatus?: string | null;
  customerRefundStatus?: string | null;
  refundDetails?: { pendingRefund?: number; immediateRefund?: number } | null;
  refundCompletedAt?: string | null;
  providerRefundDebt?: number | null;
}): boolean {
  const mode = resolveCustomerRefundDisplay(job).mode;
  if (mode === 'pending' || mode === 'processing' || mode === 'failed') return true;
  return Number(job.providerRefundDebt) > 0;
}

export const PAYMENTS_NAV_TYPES = [
  'refund_processed',
  'refund_completed',
  'refund_issued',
  'refund_staged_payout',
] as const;
