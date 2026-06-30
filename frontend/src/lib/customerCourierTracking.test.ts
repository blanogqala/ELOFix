import { describe, expect, it } from 'vitest';
import {
  courierMapShowsDestination,
  getCourierMapRoutePhase,
  getCustomerCourierTrackingBanner,
} from '@/lib/customerCourierTracking';
import type { DeliveryRequestRecord, Job } from '@/types';

const baseJob = { id: 'job-1', status: 'IN_PROGRESS' } as Job;
const baseDr = { id: 'dr-1', deliveryConfirmed: false } as DeliveryRequestRecord;

describe('getCustomerCourierTrackingBanner', () => {
  it('shows different titles for COLLECTING vs COLLECTED', () => {
    const collecting = getCustomerCourierTrackingBanner('COLLECTING', baseJob, baseDr);
    const collected = getCustomerCourierTrackingBanner('COLLECTED', baseJob, baseDr);
    expect(collecting.title).toBe('Courier heading to collection');
    expect(collected.title).toBe('Items collected');
    expect(collecting.title).not.toBe(collected.title);
  });

  it('shows distinct copy for OUT_FOR_DELIVERY and AT_DESTINATION', () => {
    const enRoute = getCustomerCourierTrackingBanner('OUT_FOR_DELIVERY', baseJob, baseDr);
    const arrived = getCustomerCourierTrackingBanner('AT_DESTINATION', baseJob, baseDr);
    expect(enRoute.title).toBe('On the way to you');
    expect(arrived.title).toBe('Courier has arrived');
    expect(enRoute.description).not.toBe(arrived.description);
  });

  it('keeps completed banner when customer confirmed and rated', () => {
    const banner = getCustomerCourierTrackingBanner('COMPLETED', {
      ...baseJob,
      status: 'COMPLETED',
      completionConfirmedByUser: true,
    }, {
      ...baseDr,
      deliveryConfirmed: true,
      customerRating: { rating: 5, createdAt: '2026-01-01T00:00:00Z' },
    });
    expect(banner.title).toBe('Delivery completed');
  });
});

describe('getCourierMapRoutePhase', () => {
  it('uses at_collection when items are collected', () => {
    expect(getCourierMapRoutePhase('COLLECTED', { ...baseDr, courierPhase: 'at_collection' }, false)).toBe(
      'at_collection'
    );
  });

  it('uses at_destination when courier has arrived', () => {
    expect(getCourierMapRoutePhase('AT_DESTINATION', baseDr, false)).toBe('at_destination');
  });
});

describe('courierMapShowsDestination', () => {
  it('shows destination only when en route or complete', () => {
    expect(courierMapShowsDestination('COLLECTING', false)).toBe(false);
    expect(courierMapShowsDestination('COLLECTED', false)).toBe(false);
    expect(courierMapShowsDestination('OUT_FOR_DELIVERY', false)).toBe(true);
    expect(courierMapShowsDestination('COLLECTED', true)).toBe(true);
  });
});
