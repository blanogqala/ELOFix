import { describe, expect, it } from 'vitest';
import type { JobMaterialOrderSnapshot, JobStoreOrder } from '@/types';
import {
  deliveryModeLabel,
  resolveDisplayDeliveryType,
} from '@/lib/providerMaterialOrderHelpers';

function storeOrder(deliveryType: JobStoreOrder['deliveryType']): JobStoreOrder {
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
  };
}

function materialOrder(deliveryType: string): JobMaterialOrderSnapshot {
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
});

describe('deliveryModeLabel', () => {
  it('labels store and courier modes', () => {
    expect(deliveryModeLabel('STORE')).toBe('Store delivery');
    expect(deliveryModeLabel('PROVIDER')).toBe('Courier delivery');
  });
});
