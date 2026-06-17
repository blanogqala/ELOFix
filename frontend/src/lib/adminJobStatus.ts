import type { Job } from '@/types';
import { ACTIVE_WORKFLOW_JOB_STATUSES } from '@/lib/jobStatusMapping';

export type AdminJobStatusCounts = {
  total: number;
  completed: number;
  active: number;
  open: number;
  cancelled: number;
  rejected: number;
};

export type PaymentSettlementStatus = 'released' | 'held' | 'pending';

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

export function resolveAdminPaymentSettlementStatus(job: Job): PaymentSettlementStatus {
  if (job.paymentSettlementStatus === 'released' || job.paymentSettlementStatus === 'held' || job.paymentSettlementStatus === 'pending') {
    return job.paymentSettlementStatus;
  }
  if (job.paymentReleased || job.status === 'COMPLETED') return 'released';
  if (job.escrow?.enabled && (job.escrow.heldAmount || 0) > 0) return 'held';
  return 'pending';
}

export function getAdminPaymentStatusDisplay(job: Job): { label: string; class: string } {
  const settlement = resolveAdminPaymentSettlementStatus(job);
  if (settlement === 'released') return { label: 'Released', class: 'text-success' };
  if (settlement === 'held') return { label: 'Held', class: 'text-warning' };
  return { label: 'Pending', class: 'text-muted-foreground' };
}
