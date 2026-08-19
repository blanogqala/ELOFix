import { AppNotification, AppNotificationType } from '@/types';
import { PAYMENTS_NAV_TYPES } from '@/lib/refundStatusDisplay';

export type JobActivitySection = 'materials' | 'messages' | 'general';

const MATERIAL_TYPES: AppNotificationType[] = [
  'material_list_submitted',
  'material_suggestion_received',
  'material_list_replaced',
  'provider_suggestion',
  'material_paid',
  'material_suggestion_accepted',
  'material_suggestion_rejected',
  'payment_made',
];

const MESSAGE_TYPES: AppNotificationType[] = ['job_chat'];

const REQUEST_TYPES: AppNotificationType[] = ['job_request'];

const GENERAL_TYPES: AppNotificationType[] = [
  'job_accepted',
  'inspection_completed',
  'price_submitted',
  'delivery_update',
  'provider_accepted',
  'provider_rejected',
  'job_completed',
  'job_cancelled',
  'material_tracking',
];

export const JOBS_NAV_TYPES: AppNotificationType[] = [
  ...MATERIAL_TYPES,
  ...MESSAGE_TYPES,
  ...GENERAL_TYPES,
];

export const REQUESTS_NAV_TYPES: AppNotificationType[] = REQUEST_TYPES;

export const CUSTOMER_PAYMENTS_NAV_TYPES: AppNotificationType[] = [
  ...PAYMENTS_NAV_TYPES,
] as AppNotificationType[];

export function hasPaymentsNavActivity(notifications: AppNotification[]): boolean {
  return notifications.some(
    (n) =>
      !n.read &&
      CUSTOMER_PAYMENTS_NAV_TYPES.includes(n.type as AppNotificationType)
  );
}

export function isPendingRequestJob(
  jobId: string,
  pendingRequestIds: Set<string> = new Set()
): boolean {
  return pendingRequestIds.has(jobId);
}

export function isRequestNavNotification(
  n: AppNotification,
  pendingRequestIds: Set<string> = new Set()
): boolean {
  if (!n.jobId || n.read) return false;
  if (REQUEST_TYPES.includes(n.type)) return true;
  if (MESSAGE_TYPES.includes(n.type) && pendingRequestIds.has(n.jobId)) return true;
  return false;
}

export function isJobsNavNotification(
  n: AppNotification,
  pendingRequestIds: Set<string> = new Set()
): boolean {
  if (isRequestNavNotification(n, pendingRequestIds)) return false;
  return isJobScopedUnread(n);
}

export function notificationSection(n: AppNotification): JobActivitySection | null {
  if (!n.jobId || n.read) return null;
  if (MESSAGE_TYPES.includes(n.type)) return 'messages';
  if (MATERIAL_TYPES.includes(n.type)) {
    if (n.type === 'payment_made' && !/material/i.test(n.message || '')) {
      return 'general';
    }
    return 'materials';
  }
  if (GENERAL_TYPES.includes(n.type)) return 'general';
  return null;
}

export function isJobScopedUnread(n: AppNotification): boolean {
  return Boolean(n.jobId && !n.read && notificationSection(n) != null);
}

export function unreadForJob(notifications: AppNotification[], jobId: string) {
  return notifications.filter((n) => n.jobId === jobId && isJobScopedUnread(n));
}

export function countSection(
  notifications: AppNotification[],
  jobId: string,
  section: JobActivitySection
): number {
  return unreadForJob(notifications, jobId).filter((n) => notificationSection(n) === section).length;
}

export function jobIdsWithActivity(
  notifications: AppNotification[],
  pendingRequestIds: Set<string> = new Set()
): Set<string> {
  const ids = new Set<string>();
  for (const n of notifications) {
    if (n.jobId && isJobsNavNotification(n, pendingRequestIds)) ids.add(n.jobId);
  }
  return ids;
}

export function hasJobsNavActivity(
  notifications: AppNotification[],
  pendingRequestIds: Set<string> = new Set()
): boolean {
  return notifications.some((n) => isJobsNavNotification(n, pendingRequestIds));
}

export function isUnreadRequest(
  n: AppNotification,
  pendingRequestIds: Set<string> = new Set()
): boolean {
  return isRequestNavNotification(n, pendingRequestIds);
}

export function hasRequestsNavActivity(
  notifications: AppNotification[],
  pendingRequestIds: Set<string> = new Set()
): boolean {
  return notifications.some((n) => isRequestNavNotification(n, pendingRequestIds));
}

export function requestHasActivity(
  notifications: AppNotification[],
  jobId: string,
  pendingRequestIds: Set<string> = new Set()
): boolean {
  return notifications.some(
    (n) => n.jobId === jobId && isRequestNavNotification(n, pendingRequestIds)
  );
}

export function activeTabHasActivity(
  notifications: AppNotification[],
  jobs: { id: string; status?: string }[],
  isActive: (status?: string) => boolean,
  pendingRequestIds: Set<string> = new Set()
): boolean {
  const activeIds = new Set(jobs.filter((j) => isActive(j.status)).map((j) => j.id));
  for (const id of jobIdsWithActivity(notifications, pendingRequestIds)) {
    if (activeIds.has(id)) return true;
  }
  return false;
}
