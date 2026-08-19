import { describe, expect, it } from 'vitest';
import type { ProviderEarningJobRow } from '@/lib/api/providerAccount';
import { getJobStatus, getStatusColor } from '@/lib/providerEarningsDerived';

function row(overrides: Partial<ProviderEarningJobRow> = {}): ProviderEarningJobRow {
  return {
    id: 'earn-1',
    title: 'Material delivery — ABC Build - Bellville',
    category: 'Delivery / moving',
    amount: 0,
    status: 'PENDING',
    laborPaid: false,
    paymentReleased: false,
    createdAt: '2026-08-19T16:27:45.000Z',
    totalPrice: 0,
    providerAmount: 0,
    releasedAmount: 0,
    remainingAmount: 0,
    paymentProgress: 'NONE',
    ...overrides,
  };
}

describe('getJobStatus', () => {
  it('shows Rejected for a rejected delivery with zero amounts', () => {
    expect(
      getJobStatus(
        row({
          workflowStatus: 'REJECTED',
          providerAmount: 0,
          releasedAmount: 0,
        })
      )
    ).toBe('Rejected');
  });

  it('still shows Cancelled for cancelled jobs', () => {
    expect(getJobStatus(row({ workflowStatus: 'CANCELLED' }))).toBe('Cancelled');
  });

  it('shows Pending when work has not started and status is not rejected', () => {
    expect(getJobStatus(row({ workflowStatus: 'PENDING', providerAmount: 0 }))).toBe('Pending');
  });

  it('shows Collecting for a paid courier job in COLLECTING', () => {
    expect(
      getJobStatus(
        row({
          title: 'Material delivery — Bellville',
          courierFlow: true,
          workflowStatus: 'PENDING',
          fulfillmentStatus: 'COLLECTING',
          deliveryPaid: true,
          providerAmount: 325.5,
          releasedAmount: 0,
          paymentProgress: 'FULLY_PAID',
        })
      )
    ).toBe('Collecting');
  });

  it('shows Delivery when the courier is out for delivery', () => {
    expect(
      getJobStatus(
        row({
          courierFlow: true,
          workflowStatus: 'IN_PROGRESS',
          fulfillmentStatus: 'OUT_FOR_DELIVERY',
          deliveryPaid: true,
        })
      )
    ).toBe('Delivery');
  });

  it('shows Payment required when admin requires the remaining completion payment', () => {
    expect(
      getJobStatus(
        row({
          title: 'tiling',
          workflowStatus: 'IN_PROGRESS',
          paymentProgress: 'FIRST_PAID',
          providerAmount: 558,
          releasedAmount: 558,
          remainingAmount: 0,
          completionPaymentDue: {
            amountDue: 600,
            status: 'DUE',
            source: 'ADMIN_RELEASE',
            resolutionLogId: 'log-1',
          },
        })
      )
    ).toBe('Payment required');
  });

  it('shows Payment overdue when the admin-required completion payment is overdue', () => {
    expect(
      getJobStatus(
        row({
          workflowStatus: 'IN_PROGRESS',
          paymentProgress: 'FIRST_PAID',
          completionPaymentDue: {
            amountDue: 600,
            status: 'OVERDUE',
            source: 'ADMIN_RELEASE',
          },
        })
      )
    ).toBe('Payment overdue');
  });

  it('shows Awaiting Confirmation for courier fulfillment COMPLETED before job complete', () => {
    expect(
      getJobStatus(
        row({
          courierFlow: true,
          workflowStatus: 'AWAITING_CONFIRMATION',
          fulfillmentStatus: 'COMPLETED',
          deliveryPaid: true,
        })
      )
    ).toBe('Awaiting Confirmation');
  });
});

describe('getStatusColor', () => {
  it('styles Rejected like Cancelled', () => {
    expect(getStatusColor('Rejected')).toBe(getStatusColor('Cancelled'));
  });
});
