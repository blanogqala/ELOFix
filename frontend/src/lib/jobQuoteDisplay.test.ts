import { describe, expect, it } from 'vitest';
import type { JobMaterialOrderSnapshot, JobStoreOrder } from '@/types';
import {
  getMaterialOrderDeliveryPaymentReminder,
  isMaterialOrderDeliveryPaymentPending,
} from '@/lib/jobQuoteDisplay';

function storeOrder(overrides: Partial<JobStoreOrder> = {}): JobStoreOrder {
  return {
    storeId: 'branch-1',
    orderId: 'order-a',
    items: [],
    storeName: 'ABC Builders',
    deliveryType: 'STORE',
    deliveryFee: 250,
    deliveryStatus: 'Approved',
    paymentStatus: 'Paid',
    invoiceId: '',
    createdAt: '2026-07-05T00:00:00.000Z',
    payment: { materialsPaid: true, deliveryPaid: false },
    ...overrides,
  };
}

function materialOrder(overrides: Partial<JobMaterialOrderSnapshot> = {}): JobMaterialOrderSnapshot {
  return {
    id: 'mo-a',
    fulfillmentStatus: 'PENDING',
    paymentStatus: 'paid',
    total: 250,
    materialsSubtotal: 250,
    platformCommission: 0,
    supplierEarning: 0,
    items: [],
    createdAt: '2026-07-05T00:00:00.000Z',
    jobStoreOrderId: 'order-a',
    deliveryType: 'STORE_DELIVERY',
    deliveryFee: 250,
    delivery: { type: 'STORE', status: 'Approved', fee: 250 },
    payment: { materialsPaid: true, deliveryPaid: false },
    ...overrides,
  };
}

describe('isMaterialOrderDeliveryPaymentPending', () => {
  it('returns true for unpaid approved store delivery', () => {
    expect(
      isMaterialOrderDeliveryPaymentPending(storeOrder(), materialOrder())
    ).toBe(true);
  });

  it('returns true for unpaid courier delivery after a quote is released', () => {
    expect(
      isMaterialOrderDeliveryPaymentPending(
        storeOrder({
          deliveryType: 'PROVIDER',
          deliveryFee: 500,
          deliveryStatus: 'Quoted',
        }),
        materialOrder({
          deliveryType: 'DELIVERY_PROVIDER',
          deliveryFee: 500,
          deliveryQuote: { fee: 500 },
          delivery: { type: 'PROVIDER', status: 'Quoted', fee: 500 },
        })
      )
    ).toBe(true);
  });

  it('returns false for quoted courier delivery once delivery is paid', () => {
    expect(
      isMaterialOrderDeliveryPaymentPending(
        storeOrder({
          deliveryType: 'PROVIDER',
          deliveryFee: 500,
          deliveryStatus: 'Quoted',
          payment: { materialsPaid: true, deliveryPaid: true },
        }),
        materialOrder({
          deliveryType: 'DELIVERY_PROVIDER',
          deliveryFee: 500,
          deliveryQuote: { fee: 500 },
          delivery: { type: 'PROVIDER', status: 'Quoted', fee: 500 },
          payment: { materialsPaid: true, deliveryPaid: true },
        })
      )
    ).toBe(false);
  });

  it('returns false for courier delivery before the quote is released', () => {
    expect(
      isMaterialOrderDeliveryPaymentPending(
        storeOrder({
          deliveryType: 'PROVIDER',
          deliveryFee: 500,
          deliveryStatus: 'PendingApproval',
        }),
        materialOrder({
          deliveryType: 'DELIVERY_PROVIDER',
          deliveryFee: 500,
          delivery: { type: 'PROVIDER', status: 'PendingApproval', fee: 500 },
        })
      )
    ).toBe(false);
  });
});

describe('getMaterialOrderDeliveryPaymentReminder', () => {
  it('returns courier-specific copy for customer courier quotes', () => {
    expect(
      getMaterialOrderDeliveryPaymentReminder(
        storeOrder({
          deliveryType: 'PROVIDER',
          deliveryFee: 500,
          deliveryStatus: 'Quoted',
        }),
        materialOrder({
          deliveryType: 'DELIVERY_PROVIDER',
          deliveryFee: 500,
          deliveryQuote: { fee: 500 },
          delivery: { type: 'PROVIDER', status: 'Quoted', fee: 500 },
        }),
        'user'
      )
    ).toBe('Pay the delivery fee to accept the courier quote. Open Full tracking view to pay.');
  });
});
