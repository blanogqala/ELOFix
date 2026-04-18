import type { JobStatus } from '@/types';

/** Six UI timeline steps (indices 0–5). Backend statuses map here; APIs unchanged. */
export const UNIFIED_TIMELINE_STEPS = [
  'Pending',
  'Inspected',
  'Service & Material Paid',
  'In Progress',
  'Awaiting Confirmation',
  'Completed',
] as const;

export const UNIFIED_TIMELINE_LAST_INDEX = UNIFIED_TIMELINE_STEPS.length - 1;

/** Backend statuses that count as “in progress” on job lists (excludes PENDING, COMPLETED, CANCELLED, REJECTED). */
export const ACTIVE_WORKFLOW_JOB_STATUSES: JobStatus[] = [
  'ASSIGNED',
  'INSPECTED',
  'SERVICE_PRICE_SUBMITTED',
  'SERVICE_PAID',
  'MATERIALS_SUBMITTED',
  'MATERIALS_PAID',
  'IN_PROGRESS',
  'AWAITING_CONFIRMATION',
];

export function isActiveWorkflowStatus(status: JobStatus): boolean {
  return ACTIVE_WORKFLOW_JOB_STATUSES.includes(status);
}

/**
 * Linear timeline index 0..5 for workflow states.
 * CANCELLED/REJECTED are handled by callers (terminal UI); do not use raw return for those in isolation.
 */
export function getUnifiedTimelineStepIndex(status: JobStatus): number {
  switch (status) {
    case 'PENDING':
      return 0;
    case 'ASSIGNED':
    case 'INSPECTED':
      return 1;
    case 'SERVICE_PRICE_SUBMITTED':
    case 'SERVICE_PAID':
    case 'MATERIALS_SUBMITTED':
    case 'MATERIALS_PAID':
      return 2;
    case 'IN_PROGRESS':
      return 3;
    case 'AWAITING_CONFIRMATION':
      return 4;
    case 'COMPLETED':
      return 5;
    case 'CANCELLED':
    case 'REJECTED':
      return 0;
    default: {
      const _x: never = status;
      return _x;
    }
  }
}

/** User-facing job status label (badges, lists). No granular backend-only names. */
export function getStandardizedStatusLabel(status: JobStatus): string {
  switch (status) {
    case 'CANCELLED':
      return 'Cancelled';
    case 'REJECTED':
      return 'Rejected';
    default:
      return UNIFIED_TIMELINE_STEPS[getUnifiedTimelineStepIndex(status)];
  }
}

/** CSS class for `.status-badge` rows (user Jobs, dashboards). */
export function getUserStatusBadgeClass(status: JobStatus): string {
  switch (status) {
    case 'CANCELLED':
      return 'status-cancelled';
    case 'REJECTED':
      return 'status-cancelled';
    default: {
      const idx = getUnifiedTimelineStepIndex(status);
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
  }
}

/** shadcn `Badge` variant for provider views */
export type ProviderBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

/** Admin status dropdown: `value` → visible label (no legacy granular names). */
export const ADMIN_JOB_STATUS_FILTER_LABELS: Record<string, string> = {
  all: 'All Statuses',
  PENDING: 'Pending',
  INSPECTED: 'Inspected',
  SERVICE_MATERIAL_PAID: 'Service & Material Paid',
  IN_PROGRESS: 'In Progress',
  AWAITING_CONFIRMATION: 'Awaiting Confirmation',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

/** Admin job list: filter `value` → backend statuses (API unchanged). */
export const ADMIN_JOB_STATUS_FILTER_GROUPS: Record<string, JobStatus[] | null> = {
  all: null,
  PENDING: ['PENDING'],
  INSPECTED: ['ASSIGNED', 'INSPECTED'],
  SERVICE_MATERIAL_PAID: [
    'SERVICE_PRICE_SUBMITTED',
    'SERVICE_PAID',
    'MATERIALS_SUBMITTED',
    'MATERIALS_PAID',
  ],
  IN_PROGRESS: ['IN_PROGRESS'],
  AWAITING_CONFIRMATION: ['AWAITING_CONFIRMATION'],
  COMPLETED: ['COMPLETED'],
  CANCELLED: ['CANCELLED'],
  REJECTED: ['REJECTED'],
};

export function jobMatchesAdminStatusFilter(status: JobStatus, filterKey: string): boolean {
  if (filterKey === 'all') return true;
  const group = ADMIN_JOB_STATUS_FILTER_GROUPS[filterKey];
  if (!group) return false;
  return group.includes(status);
}

export function getProviderStatusBadgeVariant(status: JobStatus): ProviderBadgeVariant {
  switch (status) {
    case 'CANCELLED':
    case 'REJECTED':
      return 'destructive';
    case 'COMPLETED':
      return 'default';
    default: {
      const idx = getUnifiedTimelineStepIndex(status);
      if (idx === 0) return 'secondary';
      if (idx === 1) return 'outline';
      if (idx === 2) return 'default';
      if (idx === 3) return 'default';
      if (idx === 4) return 'secondary';
      if (idx === 5) return 'default';
      return 'secondary';
    }
  }
}
