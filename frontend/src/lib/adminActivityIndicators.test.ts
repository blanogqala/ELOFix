import { describe, expect, it } from 'vitest';
import type { AppNotification } from '@/types';
import {
  hasAdminGroupActivity,
  hasAdminNavActivity,
} from './adminActivityIndicators';

function n(partial: Partial<AppNotification> & Pick<AppNotification, 'type'>): AppNotification {
  return {
    id: 'n1',
    userId: 'admin-1',
    type: partial.type,
    title: 't',
    message: 'm',
    read: partial.read ?? false,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe('adminActivityIndicators', () => {
  it('routes unread admin_provider_application_submitted to Providers nav', () => {
    const notifications = [n({ type: 'admin_provider_application_submitted' })];
    expect(hasAdminNavActivity(notifications, '/admin/providers')).toBe(true);
    expect(hasAdminNavActivity(notifications, '/admin/categories')).toBe(false);
    expect(hasAdminGroupActivity(notifications, 'Users')).toBe(true);
    expect(hasAdminGroupActivity(notifications, 'Work')).toBe(false);
  });

  it('routes unread category_suggestion to Categories nav', () => {
    const notifications = [n({ type: 'category_suggestion' })];
    expect(hasAdminNavActivity(notifications, '/admin/categories')).toBe(true);
    expect(hasAdminNavActivity(notifications, '/admin/providers')).toBe(false);
    expect(hasAdminGroupActivity(notifications, 'Work')).toBe(true);
  });

  it('ignores read notifications', () => {
    const notifications = [n({ type: 'admin_provider_application_submitted', read: true })];
    expect(hasAdminNavActivity(notifications, '/admin/providers')).toBe(false);
    expect(hasAdminGroupActivity(notifications, 'Users')).toBe(false);
  });

  it('routes fraud_alert to Fraud Center nav', () => {
    const notifications = [n({ type: 'fraud_alert' })];
    expect(hasAdminNavActivity(notifications, '/admin/fraud-center')).toBe(true);
  });

  it('routes refund admin types to Refund repayments nav', () => {
    const notifications = [n({ type: 'admin_repayment_submitted' })];
    expect(hasAdminNavActivity(notifications, '/admin/refund-repayments')).toBe(true);
    expect(hasAdminGroupActivity(notifications, 'Finance')).toBe(true);
  });

  it('routes unread dispute_opened to Jobs nav and Work group', () => {
    const notifications = [n({ type: 'dispute_opened' })];
    expect(hasAdminNavActivity(notifications, '/admin/jobs')).toBe(true);
    expect(hasAdminNavActivity(notifications, '/admin/categories')).toBe(false);
    expect(hasAdminGroupActivity(notifications, 'Work')).toBe(true);
  });

  it('clears activity after notifications are marked read', () => {
    const notifications = [n({ type: 'admin_provider_application_submitted', read: true })];
    expect(hasAdminNavActivity(notifications, '/admin/providers')).toBe(false);
    expect(hasAdminGroupActivity(notifications, 'Users')).toBe(false);
  });
});
