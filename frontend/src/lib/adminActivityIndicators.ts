import { AppNotification, AppNotificationType } from '@/types';

const PROVIDERS_TYPES: AppNotificationType[] = ['admin_provider_application_submitted'];

const CATEGORIES_TYPES: AppNotificationType[] = ['category_suggestion'];

const FRAUD_TYPES: AppNotificationType[] = ['fraud_alert'];

const REFUND_REPAYMENTS_TYPES: AppNotificationType[] = [
  'admin_repayment_submitted',
  'admin_refund_debt_overdue',
  'admin_refund_ready',
  'admin_refund_manual_required',
  'admin_refund_gateway_failed',
];

const ADMIN_NAV_TYPE_MAP: Record<string, AppNotificationType[]> = {
  '/admin/providers': PROVIDERS_TYPES,
  '/admin/categories': CATEGORIES_TYPES,
  '/admin/fraud-center': FRAUD_TYPES,
  '/admin/refund-repayments': REFUND_REPAYMENTS_TYPES,
  '/admin/jobs': ['dispute_opened'],
};

export { ADMIN_NAV_TYPE_MAP };

const ADMIN_GROUP_CHILD_PATHS: Record<string, string[]> = {
  Users: ['/admin/providers'],
  Work: ['/admin/categories', '/admin/jobs'],
  Finance: ['/admin/refund-repayments'],
};

function isUnreadAdminNavType(n: AppNotification, types: AppNotificationType[]): boolean {
  return !n.read && types.includes(n.type);
}

export function hasAdminNavActivity(
  notifications: AppNotification[],
  path: string
): boolean {
  const types = ADMIN_NAV_TYPE_MAP[path];
  if (!types) return false;
  return notifications.some((n) => isUnreadAdminNavType(n, types));
}

export function hasAdminGroupActivity(
  notifications: AppNotification[],
  groupLabel: string
): boolean {
  const paths = ADMIN_GROUP_CHILD_PATHS[groupLabel];
  if (!paths) return false;
  return paths.some((path) => hasAdminNavActivity(notifications, path));
}
