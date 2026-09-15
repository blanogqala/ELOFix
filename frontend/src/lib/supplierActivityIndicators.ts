import { AppNotification, AppNotificationType } from '@/types';

/** Actionable supplier/branch order events — not every harmless status ping. */
export const SUPPLIER_ORDERS_NAV_TYPES: AppNotificationType[] = [
  'supplier_material_order_new',
  'supplier_material_order_cancelled',
  'material_order_new',
  'material_order_cancelled',
  'material_order_customer_issue',
];

export const SUPPLIER_EARNINGS_NAV_TYPES: AppNotificationType[] = [
  'withdrawal_approved',
  'withdrawal_paid',
  'withdrawal_failed',
  'payout_status',
];

function isUnreadType(n: AppNotification, types: AppNotificationType[]): boolean {
  return !n.read && types.includes(n.type as AppNotificationType);
}

export function hasOrdersNavActivity(notifications: AppNotification[]): boolean {
  return notifications.some((n) => isUnreadType(n, SUPPLIER_ORDERS_NAV_TYPES));
}

export function hasEarningsNavActivity(notifications: AppNotification[]): boolean {
  return notifications.some((n) => isUnreadType(n, SUPPLIER_EARNINGS_NAV_TYPES));
}
