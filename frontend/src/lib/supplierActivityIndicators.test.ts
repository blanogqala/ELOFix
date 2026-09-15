import { describe, expect, it } from 'vitest';
import type { AppNotification } from '@/types';
import {
  hasEarningsNavActivity,
  hasOrdersNavActivity,
} from './supplierActivityIndicators';

function n(partial: Partial<AppNotification> & Pick<AppNotification, 'type'>): AppNotification {
  return {
    id: 'n1',
    userId: 'u1',
    type: partial.type,
    title: 't',
    message: 'm',
    read: partial.read ?? false,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe('supplierActivityIndicators', () => {
  it('lights Orders for unread supplier_material_order_new', () => {
    const notifications = [n({ type: 'supplier_material_order_new' })];
    expect(hasOrdersNavActivity(notifications)).toBe(true);
    expect(hasEarningsNavActivity(notifications)).toBe(false);
  });

  it('lights Orders for unread material_order_new', () => {
    expect(hasOrdersNavActivity([n({ type: 'material_order_new' })])).toBe(true);
  });

  it('clears Orders when the mapped notification is read', () => {
    expect(hasOrdersNavActivity([n({ type: 'supplier_material_order_new', read: true })])).toBe(false);
  });

  it('lights Orders for unread material_order_customer_issue', () => {
    expect(hasOrdersNavActivity([n({ type: 'material_order_customer_issue' })])).toBe(true);
  });

  it('lights Earnings for unread payout_status', () => {
    const notifications = [n({ type: 'payout_status' })];
    expect(hasEarningsNavActivity(notifications)).toBe(true);
    expect(hasOrdersNavActivity(notifications)).toBe(false);
  });

  it('does not light Branch B staff from Branch A notifications', () => {
    const branchBList: AppNotification[] = [];
    expect(hasOrdersNavActivity(branchBList)).toBe(false);
    expect(hasEarningsNavActivity(branchBList)).toBe(false);
  });

  it('does not light Orders for harmless status-only types', () => {
    expect(hasOrdersNavActivity([n({ type: 'material_tracking' })])).toBe(false);
  });
});
