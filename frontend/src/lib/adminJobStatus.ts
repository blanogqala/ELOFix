import type { Job } from '@/types';
import { ACTIVE_WORKFLOW_JOB_STATUSES } from '@/lib/jobStatusMapping';
import {
  getAdminCompletionPaymentStatusLabel,
  isAdminRequiredCompletionPayment,
} from '@/lib/completionPaymentDue';

export type AdminJobStatusCounts = {
  total: number;
  completed: number;
  active: number;
  open: number;
  cancelled: number;
  rejected: number;
  disputed: number;
};

export type PaymentSettlementStatus = 'released' | 'held' | 'refund' | 'pending';

export type AdminPaymentStatusFilter = 'all' | 'released' | 'held' | 'refund';

/** Mirrors backend isTerminalJobState / isJobWorkflowCompleted. */
export function isAdminJobWorkflowCompleted(job: Job): boolean {
  if (job.status === 'COMPLETED') return true;
  if (job.completionConfirmedByUser === true) return true;
  return false;
}

/** Mirrors backend countJobsByStatus buckets for admin summary tiles. */
export function countAdminJobsByStatus(jobs: Job[]): AdminJobStatusCounts {
  const counts: AdminJobStatusCounts = {
    total: jobs.length,
    completed: 0,
    active: 0,
    open: 0,
    cancelled: 0,
    rejected: 0,
    disputed: 0,
  };

  jobs.forEach((job) => {
    if (isAdminJobWorkflowCompleted(job)) {
      counts.completed += 1;
      return;
    }
    const st = job.status;
    if (st === 'REJECTED') {
      counts.rejected += 1;
      return;
    }
    if (st === 'CANCELLED') {
      counts.cancelled += 1;
      return;
    }
    if (st === 'DISPUTED') {
      counts.disputed += 1;
      counts.active += 1;
      return;
    }
    if (ACTIVE_WORKFLOW_JOB_STATUSES.includes(st)) {
      counts.active += 1;
      return;
    }
    if (st === 'PENDING') {
      counts.open += 1;
    }
  });

  return counts;
}

/** Cancelled after customer payment — refund / forfeit bucket for admin payments filter. */
export function isAdminPaymentRefundJob(job: Job): boolean {
  const refundStatus = String(job.refundStatus || '').toLowerCase();
  if (refundStatus === 'forfeited') return false;
  if (
    refundStatus === 'processed' ||
    refundStatus === 'partial' ||
    refundStatus === 'gateway_failed' ||
    refundStatus === 'recorded' ||
    refundStatus === 'pending_manual_gateway' ||
    refundStatus.includes('cancel')
  ) {
    return true;
  }
  const refunded = Number(job.refundAmount ?? 0);
  if (refunded > 0 && job.status === 'CANCELLED') return true;
  if (refunded > 0 && job.paymentSettlementStatus === 'refund') return true;
  return false;
}

export function resolveAdminPaymentSettlementStatus(job: Job): PaymentSettlementStatus {
  if (isAdminPaymentRefundJob(job)) return 'refund';
  if (job.paymentSettlementStatus === 'refund') return 'refund';
  if (job.paymentSettlementStatus === 'released' || job.paymentSettlementStatus === 'held' || job.paymentSettlementStatus === 'pending') {
    return job.paymentSettlementStatus;
  }
  if (job.paymentReleased || job.status === 'COMPLETED') return 'released';
  if (job.escrow?.enabled && (job.escrow.heldAmount || 0) > 0) return 'held';
  return 'pending';
}

export function jobMatchesAdminPaymentStatusFilter(job: Job, filter: AdminPaymentStatusFilter): boolean {
  if (filter === 'all') return true;
  return resolveAdminPaymentSettlementStatus(job) === filter;
}

function isPartialRefundDisplay(job: Job): boolean {
  if (String(job.refundStatus || '').toLowerCase() === 'partial') return true;
  const gross = Number(job.totalPrice ?? job.servicePrice?.amount ?? 0);
  if (!Number.isFinite(gross) || gross <= 0) return false;
  const maxNet = Math.round(gross * 0.93 * 100) / 100;
  const refunded = Number(job.refundAmount ?? 0);
  return refunded > 0 && refunded < maxNet - 0.01;
}

export function getAdminPaymentStatusDisplay(job: Job): { label: string; class: string } {
  const settlement = resolveAdminPaymentSettlementStatus(job);
  if (settlement === 'refund') {
    if (job.status === 'CANCELLED') {
      return { label: 'Cancelled · refunded', class: 'text-destructive' };
    }
    return {
      label: isPartialRefundDisplay(job) ? 'Partial refund' : 'Refund',
      class: 'text-destructive',
    };
  }
  if (isAdminRequiredCompletionPayment(job)) {
    return { label: getAdminCompletionPaymentStatusLabel(job), class: 'text-warning' };
  }
  if (settlement === 'released') return { label: 'Released', class: 'text-success' };
  if (settlement === 'held') return { label: 'Held', class: 'text-warning' };
  return { label: 'Pending', class: 'text-muted-foreground' };
}
