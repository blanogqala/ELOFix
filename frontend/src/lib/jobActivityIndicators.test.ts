import { describe, expect, it } from 'vitest';
import type { AppNotification } from '@/types';
import {
  hasJobsNavActivity,
  hasRequestsNavActivity,
  isUnreadRequest,
  requestHasActivity,
} from './jobActivityIndicators';

function n(partial: Partial<AppNotification> & Pick<AppNotification, 'type'>): AppNotification {
  return {
    id: 'n1',
    userId: 'u1',
    type: partial.type,
    title: 't',
    message: 'm',
    read: partial.read ?? false,
    createdAt: new Date().toISOString(),
    jobId: partial.jobId ?? 'job-1',
    ...partial,
  };
}

describe('jobActivityIndicators', () => {
  it('routes unread job_request to Requests nav only', () => {
    const notifications = [n({ type: 'job_request' })];
    expect(hasRequestsNavActivity(notifications)).toBe(true);
    expect(hasJobsNavActivity(notifications)).toBe(false);
    expect(isUnreadRequest(notifications[0])).toBe(true);
  });

  it('routes active-job job_chat to Jobs nav only when not pending', () => {
    const notifications = [n({ type: 'job_chat', jobId: 'job-active' })];
    expect(hasJobsNavActivity(notifications)).toBe(true);
    expect(hasRequestsNavActivity(notifications)).toBe(false);
  });

  it('routes pending job_chat to Requests nav only', () => {
    const pendingIds = new Set(['job-pending']);
    const notifications = [n({ type: 'job_chat', jobId: 'job-pending' })];
    expect(hasRequestsNavActivity(notifications, pendingIds)).toBe(true);
    expect(hasJobsNavActivity(notifications, pendingIds)).toBe(false);
    expect(requestHasActivity(notifications, 'job-pending', pendingIds)).toBe(true);
  });

  it('ignores read job_request', () => {
    const notifications = [n({ type: 'job_request', read: true })];
    expect(hasRequestsNavActivity(notifications)).toBe(false);
    expect(hasJobsNavActivity(notifications)).toBe(false);
  });
});
