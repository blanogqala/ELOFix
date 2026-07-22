import { describe, expect, it } from 'vitest';
import type { DeliveryRequestRecord, Job } from '@/types';
import {
  COURIER_STATUS_WAITING_QUOTATION,
  getCourierJobDisplayStatusLabel,
  getCourierTimelineStepInsight,
} from './courierJobTimeline';
import {
  getJobDisplayStatusLabel,
  SERVICE_STATUS_WAITING_PRICE,
} from './jobProgressDisplay';
import { getCourierTimelineViewState } from './courierJobTimeline';

function courierJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    category: 'delivery',
    categoryName: 'Delivery',
    userId: 'user-1',
    userName: 'Customer',
    description: 'Test',
    images: [],
    measurements: {},
    materials: [],
    laborEstimateRange: { min: 0, max: 0, unit: 'job' },
    totalEstimateRange: { min: 0, max: 0 },
    paymentPlan: { type: 'full' },
    escrow: { status: 'pending' },
    status: 'ASSIGNED',
    jobNotes: [],
    chat: [],
    laborPaid: false,
    courierFlow: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Job;
}

function dr(overrides: Partial<DeliveryRequestRecord> = {}): DeliveryRequestRecord {
  return {
    id: 'dr-1',
    status: 'pending_quote',
    ...overrides,
  } as DeliveryRequestRecord;
}

describe('getCourierJobDisplayStatusLabel', () => {
  it('shows Waiting for quotation when accepted but quote not submitted', () => {
    const job = courierJob({ status: 'ASSIGNED' });
    expect(getCourierJobDisplayStatusLabel(job, dr({ status: 'pending_quote' }))).toBe(
      COURIER_STATUS_WAITING_QUOTATION
    );
    expect(
      getCourierJobDisplayStatusLabel(
        courierJob({
          status: 'ASSIGNED',
          deliverySummary: { status: 'pending_quote', deliveryPaid: false },
        })
      )
    ).toBe(COURIER_STATUS_WAITING_QUOTATION);
  });

  it('shows Awaiting Payment when quote submitted and unpaid', () => {
    const job = courierJob({ status: 'ASSIGNED' });
    expect(getCourierJobDisplayStatusLabel(job, dr({ status: 'quoted', quotedFee: 250 }))).toBe(
      'Awaiting Payment'
    );
  });

  it('shows Collecting when delivery fee paid', () => {
    const job = courierJob({ status: 'ASSIGNED' });
    expect(
      getCourierJobDisplayStatusLabel(
        job,
        dr({ status: 'paid', payment: { deliveryPaid: true } })
      )
    ).toBe('Collecting');
  });

  it('shows Collecting when courier fulfillment is COLLECTING (even if job.status is awaiting payment)', () => {
    expect(
      getCourierJobDisplayStatusLabel(
        courierJob({
          status: 'SERVICE_PRICE_SUBMITTED',
          deliverySummary: { status: 'approved', deliveryPaid: false, fulfillmentStatus: 'COLLECTING' },
        })
      )
    ).toBe('Collecting');
  });
});

describe('getCourierTimelineStepInsight', () => {
  it('uses customer-friendly copy for pending_quote at step 1', () => {
    const job = courierJob({ status: 'ASSIGNED' });
    const insight = getCourierTimelineStepInsight(job, dr({ status: 'pending_quote' }), 1);
    expect(insight.nextAction).toBe('Waiting for the courier to submit a delivery quote.');
  });
});

describe('getCourierTimelineViewState', () => {
  it('maps COLLECTING fulfillment to the Collecting step', () => {
    const job = courierJob({
      status: 'SERVICE_PRICE_SUBMITTED',
      progressStep: 0,
      deliverySummary: { status: 'approved', deliveryPaid: false, fulfillmentStatus: 'COLLECTING' },
    });
    const view = getCourierTimelineViewState(job, null, []);
    expect(view.currentIdx).toBe(2);
  });

  it('pins cancel on Pending when cancelled before accept', () => {
    const job = courierJob({
      status: 'CANCELLED',
      providerId: 'courier-1',
      progressStep: 0,
      cancelledAtStatus: 'PENDING',
      cancelledAt: '2026-07-22T20:00:00.000Z',
      cancellationSource: 'customer_changed_delivery_option',
    });
    const view = getCourierTimelineViewState(job, null, []);
    expect(view.terminal).toBe('cancelled');
    expect(view.pinIndex).toBe(0);
    expect(view.currentIdx).toBe(0);
  });

  it('does not advance past Pending for legacy pending cancels that only have providerId', () => {
    const job = courierJob({
      status: 'CANCELLED',
      providerId: 'courier-1',
      progressStep: 0,
      cancellationSource: 'customer_changed_delivery_option',
    });
    const view = getCourierTimelineViewState(job, null, []);
    expect(view.terminal).toBe('cancelled');
    expect(view.pinIndex).toBe(0);
  });

  it('pins cancel on Awaiting Payment when cancelled after accept', () => {
    const job = courierJob({
      status: 'CANCELLED',
      providerId: 'courier-1',
      progressStep: 1,
      cancelledAtStatus: 'ACCEPTED' as Job['cancelledAtStatus'],
      cancellationSource: 'customer_changed_delivery_option',
    });
    const view = getCourierTimelineViewState(job, null, []);
    expect(view.terminal).toBe('cancelled');
    expect(view.pinIndex).toBe(1);
  });
});

describe('getJobDisplayStatusLabel', () => {
  it('shows Waiting for service price before provider submits price', () => {
    const job = {
      ...courierJob({ courierFlow: false, status: 'ASSIGNED' }),
      servicePrice: undefined,
    } as Job;
    expect(getJobDisplayStatusLabel(job)).toBe(SERVICE_STATUS_WAITING_PRICE);
  });

  it('shows Awaiting Payment after service price submitted', () => {
    const job = {
      ...courierJob({ courierFlow: false, status: 'SERVICE_PRICE_SUBMITTED' }),
      servicePrice: { amount: 500 },
      progressStep: 2,
    } as Job;
    expect(getJobDisplayStatusLabel(job)).toBe('Awaiting Payment');
  });
});
