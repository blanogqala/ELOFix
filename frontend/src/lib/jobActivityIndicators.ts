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

export function jobIdsWithActivity(notifications: AppNotification[]): Set<string> {
  const ids = new Set<string>();
  for (const n of notifications) {
    if (n.jobId && isJobScopedUnread(n)) ids.add(n.jobId);
  }
  return ids;
}

export function hasJobsNavActivity(notifications: AppNotification[]): boolean {
  return jobIdsWithActivity(notifications).size > 0;
}

export function isUnreadRequest(n: AppNotification): boolean {
  return Boolean(n.jobId && !n.read && REQUEST_TYPES.includes(n.type));
}

export function hasRequestsNavActivity(notifications: AppNotification[]): boolean {
  return notifications.some(isUnreadRequest);
}

export function activeTabHasActivity(
  notifications: AppNotification[],
  jobs: { id: string; status?: string }[],
  isActive: (status?: string) => boolean
): boolean {
  const activeIds = new Set(jobs.filter((j) => isActive(j.status)).map((j) => j.id));
  for (const id of jobIdsWithActivity(notifications)) {
    if (activeIds.has(id)) return true;
  }
  return false;
}
