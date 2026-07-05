import { describe, expect, it } from 'vitest';
import type { MaterialBatch } from '@/types';
import {
  currentTrackingStepBadgeLabel,
  currentTrackingStepDisplay,
} from '@/lib/materialBatchTracking';

function batch(overrides: Partial<MaterialBatch>): MaterialBatch {
  return {
    id: 'batch-1',
    supplierId: 'sup-1',
    items: [],
    status: 'pending',
    deliveryType: 'delivery',
    timestamps: {},
    ...overrides,
  };
}

describe('currentTrackingStepDisplay', () => {
  it('returns null for pending', () => {
    expect(currentTrackingStepDisplay(batch({ status: 'pending' }))).toBeNull();
  });

  it('shows Out for delivery (4/5) when status is out_for_delivery', () => {
    expect(
      currentTrackingStepDisplay(batch({ status: 'out_for_delivery', deliveryType: 'delivery' }))
    ).toBe('Out for delivery (4/5)');
  });

  it('shows Delivered (5/5) when status is delivered', () => {
    expect(
      currentTrackingStepDisplay(batch({ status: 'delivered', deliveryType: 'delivery' }))
    ).toBe('Delivered (5/5)');
  });

  it('shows Preparing (2/5) when status is preparing', () => {
    expect(
      currentTrackingStepDisplay(batch({ status: 'preparing', deliveryType: 'delivery' }))
    ).toBe('Preparing (2/5)');
  });

  it('shows Ready (3/4) for pickup when status is ready', () => {
    expect(
      currentTrackingStepDisplay(batch({ status: 'ready', deliveryType: 'pickup' }))
    ).toBe('Ready (3/4)');
  });
});

describe('currentTrackingStepBadgeLabel', () => {
  it('returns null for pending', () => {
    expect(currentTrackingStepBadgeLabel(batch({ status: 'pending' }))).toBeNull();
  });

  it('returns short label without step count for delivery', () => {
    expect(
      currentTrackingStepBadgeLabel(batch({ status: 'out_for_delivery', deliveryType: 'delivery' }))
    ).toBe('Out for delivery');
  });

  it('returns Ready for collection for pickup ready', () => {
    expect(
      currentTrackingStepBadgeLabel(batch({ status: 'ready', deliveryType: 'pickup' }))
    ).toBe('Ready');
  });
});

