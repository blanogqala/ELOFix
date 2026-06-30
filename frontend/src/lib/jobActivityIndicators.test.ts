import { describe, expect, it } from 'vitest';
import type { AppNotification } from '@/types';
import {
  hasJobsNavActivity,
  hasRequestsNavActivity,
  isUnreadRequest,
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

  it('routes active-job notifications to Jobs nav only', () => {
    const notifications = [n({ type: 'job_chat' })];
    expect(hasJobsNavActivity(notifications)).toBe(true);
    expect(hasRequestsNavActivity(notifications)).toBe(false);
  });

  it('ignores read job_request', () => {
    const notifications = [n({ type: 'job_request', read: true })];
    expect(hasRequestsNavActivity(notifications)).toBe(false);
    expect(hasJobsNavActivity(notifications)).toBe(false);
  });
});
