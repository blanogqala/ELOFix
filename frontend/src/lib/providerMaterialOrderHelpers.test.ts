import { describe, expect, it } from 'vitest';
import type { JobMaterialOrderSnapshot, JobStoreOrder } from '@/types';
import {
  deliveryModeLabel,
  isDeliverySelectionCleared,
  resolveDeliveryModeBadgeLabel,
  resolveDisplayDeliveryType,
} from '@/lib/providerMaterialOrderHelpers';

function storeOrder(
  deliveryType: JobStoreOrder['deliveryType'],
  overrides: Partial<JobStoreOrder> = {}
): JobStoreOrder {
  return {
    storeId: 'branch-1',
    orderId: 'order-a',
    items: [],
    storeName: 'ABC Builders',
    deliveryType,
    deliveryFee: 0,
    deliveryStatus: 'SelfCollect',
    paymentStatus: 'Paid',
    invoiceId: '',
    createdAt: '2026-07-05T00:00:00.000Z',
    payment: { materialsPaid: true, deliveryPaid: true },
    ...overrides,
  };
}

function materialOrder(
  deliveryType: string,
  overrides: Partial<JobMaterialOrderSnapshot> = {}
): JobMaterialOrderSnapshot {
  return {
    id: 'mo-a',
    fulfillmentStatus: 'OUT_FOR_DELIVERY',
    paymentStatus: 'paid',
    total: 749.99,
    materialsSubtotal: 250,
    platformCommission: 0,
    supplierEarning: 0,
    items: [],
    createdAt: '2026-07-05T00:00:00.000Z',
    jobStoreOrderId: 'order-a',
    deliveryType,
    ...overrides,
  };
}

describe('resolveDisplayDeliveryType', () => {
  it('prefers material order STORE_DELIVERY over corrupted store order PROVIDER', () => {
    expect(
      resolveDisplayDeliveryType(storeOrder('PROVIDER'), materialOrder('STORE_DELIVERY'))
    ).toBe('STORE');
  });

  it('maps DELIVERY_PROVIDER to PROVIDER', () => {
    expect(
      resolveDisplayDeliveryType(storeOrder('SELF'), materialOrder('DELIVERY_PROVIDER'))
    ).toBe('PROVIDER');
  });

  it('falls back to store order when material order has no delivery type', () => {
    expect(resolveDisplayDeliveryType(storeOrder('PROVIDER'), null)).toBe('PROVIDER');
  });

  it('returns null when delivery status is Cancelled', () => {
    expect(
      resolveDisplayDeliveryType(
        storeOrder('PROVIDER', { deliveryStatus: 'Cancelled' }),
        materialOrder('DELIVERY_PROVIDER', {
          delivery: { type: 'PROVIDER', status: 'Cancelled', fee: 0 },
          deliveryStatus: 'Cancelled',
        })
      )
    ).toBeNull();
  });
});

describe('isDeliverySelectionCleared', () => {
  it('detects cancelled material-order delivery', () => {
    expect(
      isDeliverySelectionCleared(
        storeOrder('PROVIDER'),
        materialOrder('DELIVERY_PROVIDER', {
          delivery: { type: 'PROVIDER', status: 'Cancelled', fee: 0 },
        })
      )
    ).toBe(true);
  });

  it('detects cleared selection when courier fulfillment is CANCELLED', () => {
    expect(
      isDeliverySelectionCleared(
        storeOrder('PROVIDER', { deliveryStatus: 'Approved' }),
        materialOrder('DELIVERY_PROVIDER', {
          delivery: { type: 'PROVIDER', status: 'Processing', fee: 300 },
          courierFulfillmentStatus: 'CANCELLED',
        })
      )
    ).toBe(true);
  });
});

describe('deliveryModeLabel', () => {
  it('labels store and courier modes', () => {
    expect(deliveryModeLabel('STORE')).toBe('Store delivery');
    expect(deliveryModeLabel('PROVIDER')).toBe('Courier delivery');
  });

  it('labels cleared selection', () => {
    expect(deliveryModeLabel(null)).toBe('Not selected');
  });
});

describe('resolveDeliveryModeBadgeLabel', () => {
  it('shows Not selected after courier cancel clears delivery', () => {
    expect(
      resolveDeliveryModeBadgeLabel(
        storeOrder('PROVIDER', { deliveryStatus: 'Cancelled' }),
        materialOrder('DELIVERY_PROVIDER', {
          delivery: { type: 'PROVIDER', status: 'Cancelled', fee: 0 },
        })
      )
    ).toBe('Not selected');
  });

  it('keeps Courier delivery when selection is active', () => {
    expect(
      resolveDeliveryModeBadgeLabel(
        storeOrder('PROVIDER', { deliveryStatus: 'Approved' }),
        materialOrder('DELIVERY_PROVIDER', {
          delivery: { type: 'PROVIDER', status: 'Approved', fee: 50 },
        })
      )
    ).toBe('Courier delivery');
  });
});
