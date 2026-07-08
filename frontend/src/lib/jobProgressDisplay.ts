import type { Job } from '@/types';
import type { ProviderBadgeVariant } from '@/lib/jobStatusMapping';
import {
  UNIFIED_TIMELINE_STEPS,
  getJobStatusLabelFromProgressStep,
  getUserStatusBadgeClass,
  getProviderStatusBadgeVariant,
} from '@/lib/jobStatusMapping';
import { getCourierJobDisplayStatusLabel, getCourierTimelineStepIndex } from '@/lib/courierJobTimeline';

/** Re-export canonical six timeline labels (Provider & Customer). */
export const JOB_TIMELINE_LABELS = UNIFIED_TIMELINE_STEPS;

export const SERVICE_STATUS_WAITING_PRICE = 'Waiting for service price';

function isAwaitingServicePrice(job: Job): boolean {
  if (job.courierFlow) return false;
  if (job.servicePrice || job.laborPaid || job.proposedLaborPrice) return false;
  return job.status === 'ASSIGNED' || job.status === 'INSPECTED';
}

/** User / provider job cards & headers — labels follow `getMonotonicTimelineStepIndex` ↔ `job.progressStep`. */
export function getJobDisplayStatusLabel(job: Job): string {
  if (job.status === 'CANCELLED') return 'Cancelled';
  if (job.status === 'REJECTED') return 'Rejected';
  if (job.status === 'DISPUTED') {
    if (job.cancellationSource === 'customer_cancel' || job.cancellationSource === 'provider_cancel') {
      return 'Cancellation';
    }
    return 'Disputed';
  }
  if (job.courierFlow) {
    return getCourierJobDisplayStatusLabel(job);
  }
  if (isAwaitingServicePrice(job)) {
    return SERVICE_STATUS_WAITING_PRICE;
  }
  return getJobStatusLabelFromProgressStep(getMonotonicTimelineStepIndex(job));
}

export function getUserJobBadgeClassForJob(job: Job): string {
  if (job.status === 'CANCELLED' || job.status === 'REJECTED' || job.status === 'DISPUTED') {
    return getUserStatusBadgeClass(job.status);
  }
  const idx = job.courierFlow
    ? Math.min(
        5,
        Math.max(
          Number.isFinite(Number(job.progressStep)) ? Number(job.progressStep) : 0,
          getCourierTimelineStepIndex(job, null)
        )
      )
    : getMonotonicTimelineStepIndex(job);
  const classes: Record<number, string> = {
    0: 'status-created',
    1: 'status-assigned',
    2: 'status-in-progress',
    3: 'status-in-progress',
    4: 'status-assigned',
    5: 'status-completed',
  };
  return classes[idx] ?? 'status-created';
}

export function getProviderJobBadgeVariantForJob(job: Job): ProviderBadgeVariant {
  if (job.status === 'CANCELLED' || job.status === 'REJECTED' || job.status === 'COMPLETED') {
    return getProviderStatusBadgeVariant(job.status);
  }
  const idx = job.courierFlow
    ? Math.min(
        5,
        Math.max(
          Number.isFinite(Number(job.progressStep)) ? Number(job.progressStep) : 0,
          getCourierTimelineStepIndex(job, null)
        )
      )
    : getMonotonicTimelineStepIndex(job);
  if (idx === 0) return 'secondary';
  if (idx === 1) return 'outline';
  if (idx === 2) return 'default';
  if (idx === 3) return 'default';
  if (idx === 4) return 'secondary';
  return 'default';
}

export function dedupeStoreOrders(storeOrders: Job['storeOrders']): NonNullable<Job['storeOrders']> {
  const seen = new Set<string>();
  const list = storeOrders || [];
  return list.filter((o) => {
    const id = String(o.orderId || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function isDeadJobStoreOrder(order: NonNullable<Job['storeOrders']>[number]): boolean {
  const r = order.materialBatchResolution;
  return r === 'rejected_by_customer' || r === 'cancelled_by_provider';
}

function activeDedupedStoreOrders(storeOrders: Job['storeOrders']): NonNullable<Job['storeOrders']> {
  return dedupeStoreOrders(storeOrders).filter((o) => !isDeadJobStoreOrder(o));
}

/**
 * Aggregate material payment: all **active** store checkout batches paid, or legacy materialPayments per supplier.
 */
export function allMaterialsPaidAggregate(job: Job): boolean {
  const orders = activeDedupedStoreOrders(job.storeOrders);
  if (orders.length > 0) {
    return orders.every((o) => o.payment?.materialsPaid === true);
  }
  const lines = job.materials || [];
  if (lines.length === 0) return true;
  const supplierIds = [...new Set(lines.map((m) => String(m.supplierId)))];
  for (const sid of supplierIds) {
    const paid = job.materialPayments?.some((p) => String(p.supplierId) === sid && p.status === 'paid');
    if (!paid) return false;
  }
  return true;
}

/** @deprecated Use allMaterialsPaidAggregate */
export const allMaterialStoreOrdersPaid = allMaterialsPaidAggregate;

function materialLinePaid(m: Job['materials'][number]): boolean {
  const s = (m as { status?: string }).status;
  return String(s || '').toLowerCase() === 'paid';
}

/**
 * Sticky flag from API plus payment-derived signals (legacy jobs without meta.hasStarted).
 * Matches backend resolveJobHasStarted / deriveHasStartedFromMeta.
 */
export function jobHasStarted(job: Job): boolean {
  if (job.hasStarted === true) return true;
  if (job.laborPaid === true) return true;
  if (job.materialPayments?.some((p) => p.status === 'paid')) return true;
  const orders = dedupeStoreOrders(job.storeOrders);
  if (orders.some((o) => o.payment?.materialsPaid === true)) return true;
  if ((job.materials || []).some((m) => materialLinePaid(m))) return true;
  return false;
}

/**
 * Pure 0..5 timeline index from true job state (backend fields).
 * Once jobHasStarted, index is at least 3 (In Progress) until awaiting confirmation or completed.
 */
export function getStepIndexFromJobState(job: Job): number {
  const st = job.status;
  if (st === 'CANCELLED' || st === 'REJECTED') return 0;

  if (job.completionConfirmedByUser === true || st === 'COMPLETED') return 5;
  if (st === 'AWAITING_CONFIRMATION') return 4;
  if (st === 'DISPUTED') {
    // Cancellation-review cases open while work may still be "In Progress" (step 4).
    // Keep true disputes on the dedicated dispute step (step 5).
    if (job.cancellationSource === 'customer_cancel' || job.cancellationSource === 'provider_cancel') {
      return 3;
    }
    return 4;
  }

  if (jobHasStarted(job)) return 3;

  if (st === 'PENDING') return 0;
  if (st === 'INSPECTED' || st === 'ASSIGNED') return 1;
  return 2;
}

/**
 * Never regress below persisted milestone (job.progressStep, 0–5 from API).
 */
export function getMonotonicTimelineStepIndex(job: Job): number {
  const derived = getStepIndexFromJobState(job);
  const raw = Number(job.progressStep);
  const stored = Number.isFinite(raw) && raw >= 0 ? raw : 0;
  return Math.max(stored, derived);
}

/** @deprecated Use getMonotonicTimelineStepIndex */
export function getMonotonicProgressDisplayIndex(job: Job): number {
  return getMonotonicTimelineStepIndex(job);
}
