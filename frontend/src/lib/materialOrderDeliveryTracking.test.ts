import { describe, expect, it } from 'vitest';
import type { JobMaterialOrderSnapshot, MaterialBatch } from '@/types';
import { resolveMaterialOrderDeliveryTrackingBadge } from '@/lib/materialOrderDeliveryTracking';

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

function materialOrder(overrides: Partial<JobMaterialOrderSnapshot>): JobMaterialOrderSnapshot {
  return {
    id: 'mo-1',
    fulfillmentStatus: 'PENDING',
    paymentStatus: 'paid',
    total: 500,
    materialsSubtotal: 500,
    platformCommission: 0,
    supplierEarning: 0,
    items: [],
    createdAt: '2026-07-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveMaterialOrderDeliveryTrackingBadge', () => {
  it('uses courier delivery status instead of supplier batch status', () => {
    const label = resolveMaterialOrderDeliveryTrackingBadge({
      deliveryPayPending: false,
      isRefunded: false,
      displayDeliveryType: 'PROVIDER',
      mo: materialOrder({
        fulfillmentStatus: 'PREPARING',
        courierFulfillmentStatus: 'COLLECTING',
      }),
      batch: batch({ status: 'preparing', deliveryType: 'delivery' }),
    });

    expect(label).toBe('Heading to collection');
    expect(label).not.toBe('Preparing');
  });

  it('prioritizes unpaid delivery warning', () => {
    expect(
      resolveMaterialOrderDeliveryTrackingBadge({
        deliveryPayPending: true,
        isRefunded: false,
        displayDeliveryType: 'PROVIDER',
        mo: materialOrder({ courierFulfillmentStatus: 'COLLECTING' }),
        batch: batch({ status: 'preparing' }),
      })
    ).toBe('Delivery unpaid');
  });

  it('maps store delivery progress from delivery workflow status', () => {
    expect(
      resolveMaterialOrderDeliveryTrackingBadge({
        deliveryPayPending: false,
        isRefunded: false,
        displayDeliveryType: 'STORE',
        mo: materialOrder({
          delivery: { type: 'STORE', status: 'InProgress', fee: 250 },
        }),
        batch: batch({ status: 'accepted' }),
      })
    ).toBe('Out for delivery');
  });

  it('does not show delivery tracking badge for pickup', () => {
    expect(
      resolveMaterialOrderDeliveryTrackingBadge({
        deliveryPayPending: false,
        isRefunded: false,
        displayDeliveryType: 'SELF',
        mo: materialOrder({ fulfillmentStatus: 'READY' }),
        batch: batch({ status: 'ready', deliveryType: 'pickup' }),
      })
    ).toBeNull();
  });

  it('does not fall back to supplier batch status for courier delivery', () => {
    expect(
      resolveMaterialOrderDeliveryTrackingBadge({
        deliveryPayPending: false,
        isRefunded: false,
        displayDeliveryType: 'PROVIDER',
        mo: materialOrder({ fulfillmentStatus: 'PREPARING' }),
        batch: batch({ status: 'preparing', deliveryType: 'delivery' }),
      })
    ).toBeNull();
  });
});
