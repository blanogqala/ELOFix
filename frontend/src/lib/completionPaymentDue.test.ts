import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import {
  hasOutstandingCompletionPayment,
  isAdminRequiredCompletionPayment,
  isCompletionPaymentOverdue,
  getAdminCompletionPaymentStatusLabel,
  formatCompletionPaymentDueDate,
  getCompletionPaymentDueSummaryLine,
  getProviderAdminPaymentWaitingTitle,
  getProviderAdminPaymentWaitingDescription,
  getProviderAdminPaymentTimelineInsight,
} from './completionPaymentDue';

function job(partial: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    userId: 'u1',
    userName: 'Customer',
    category: 'tiling',
    categoryName: 'Tiling',
    description: 'Test',
    status: 'AWAITING_CONFIRMATION',
    laborEstimateRange: { min: 0, max: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  } as Job;
}

describe('completionPaymentDue', () => {
  it('detects outstanding completion payment', () => {
    const j = job({
      completionPaymentDue: { amountDue: 600, dueAt: new Date().toISOString(), status: 'DUE' },
      paymentProgress: 'FIRST_PAID',
    });
    expect(hasOutstandingCompletionPayment(j)).toBe(true);
  });

  it('returns false when fully paid', () => {
    const j = job({
      completionPaymentDue: { amountDue: 600, dueAt: new Date().toISOString(), status: 'DUE' },
      paymentProgress: 'FULLY_PAID',
    });
    expect(hasOutstandingCompletionPayment(j)).toBe(false);
  });

  it('detects admin-required payment via ADMIN_RELEASE source', () => {
    const j = job({
      completionPaymentDue: {
        amountDue: 600,
        dueAt: new Date().toISOString(),
        status: 'DUE',
        source: 'ADMIN_RELEASE',
      },
      paymentProgress: 'FIRST_PAID',
    });
    expect(isAdminRequiredCompletionPayment(j)).toBe(true);
  });

  it('detects admin-required payment via resolutionLogId', () => {
    const j = job({
      completionPaymentDue: {
        amountDue: 600,
        dueAt: new Date().toISOString(),
        status: 'DUE',
        source: 'COMPLETION_WORKFLOW',
        resolutionLogId: 'log-1',
      },
      paymentProgress: 'FIRST_PAID',
    });
    expect(isAdminRequiredCompletionPayment(j)).toBe(true);
  });

  it('does not treat COMPLETION_WORKFLOW alone as admin-required', () => {
    const j = job({
      completionPaymentDue: {
        amountDue: 600,
        dueAt: new Date().toISOString(),
        status: 'DUE',
        source: 'COMPLETION_WORKFLOW',
      },
      paymentProgress: 'FIRST_PAID',
    });
    expect(hasOutstandingCompletionPayment(j)).toBe(true);
    expect(isAdminRequiredCompletionPayment(j)).toBe(false);
  });

  it('detects overdue status', () => {
    const j = job({
      completionPaymentDue: { amountDue: 600, dueAt: new Date().toISOString(), status: 'OVERDUE' },
    });
    expect(isCompletionPaymentOverdue(j)).toBe(true);
  });

  it('returns admin status labels', () => {
    const due = job({
      completionPaymentDue: {
        amountDue: 600,
        dueAt: '2026-09-17T12:00:00.000Z',
        status: 'DUE',
        source: 'ADMIN_RELEASE',
      },
      paymentProgress: 'FIRST_PAID',
    });
    expect(getAdminCompletionPaymentStatusLabel(due)).toBe('Payment required');
    expect(formatCompletionPaymentDueDate(due)).toBeTruthy();
    expect(getCompletionPaymentDueSummaryLine(due)).toMatch(/Pay R\s*600/);

    const overdue = job({
      completionPaymentDue: {
        amountDue: 600,
        dueAt: '2026-01-01T12:00:00.000Z',
        status: 'OVERDUE',
        source: 'ADMIN_RELEASE',
      },
      paymentProgress: 'FIRST_PAID',
    });
    expect(getAdminCompletionPaymentStatusLabel(overdue)).toBe('Payment overdue');
  });

  it('returns provider admin-payment copy helpers', () => {
    expect(getProviderAdminPaymentWaitingTitle()).toBe('Waiting for customer final payment');
    expect(getProviderAdminPaymentWaitingDescription()).toMatch(/dispute or cancellation/i);
    expect(getProviderAdminPaymentTimelineInsight()).toMatch(/admin resolution/i);
  });
});
