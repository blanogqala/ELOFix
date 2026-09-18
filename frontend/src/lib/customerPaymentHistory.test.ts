import { describe, expect, it } from 'vitest';
import type { Invoice } from '@/types';
import {
  groupPaymentInvoices,
  invoiceDisplayLabel,
  isPaymentInvoice,
  isRefundInvoice,
  paymentGroupKey,
} from '@/lib/customerPaymentHistory';

function inv(over: Partial<Invoice>): Invoice {
  return {
    id: 'inv-1',
    jobId: 'job-1',
    userId: 'user-1',
    type: 'labor',
    status: 'paid',
    totalAmount: 50,
    lineItems: [{ description: 'Labor / Service', quantity: 1, unitPrice: 50, total: 50 }],
    paymentMethod: 'Card',
    paidAt: '2026-09-14T10:00:00.000Z',
    createdAt: '2026-09-14T10:00:00.000Z',
    ...over,
  };
}

describe('customerPaymentHistory', () => {
  it('labor partially_refunded stays in Payments, not Refund Invoices', () => {
    const labor = inv({ id: 'p1', type: 'labor', status: 'partially_refunded', totalAmount: 200 });
    expect(isPaymentInvoice(labor)).toBe(true);
    expect(isRefundInvoice(labor)).toBe(false);
  });

  it('type=refund status=refunded is a Refund Invoice', () => {
    const refund = inv({ id: 'r1', type: 'refund', status: 'refunded', totalAmount: 186 });
    expect(isRefundInvoice(refund)).toBe(true);
    expect(isPaymentInvoice(refund)).toBe(false);
  });

  it('original R200 payment and R186 refund stay on separate tabs with no +R200 refund row', () => {
    const original = inv({
      id: 'pay-200',
      type: 'labor',
      status: 'partially_refunded',
      totalAmount: 200,
      paymentType: 'DEPOSIT',
    });
    const refund = inv({
      id: 'ref-186',
      type: 'refund',
      status: 'refunded',
      totalAmount: 186,
    });
    const jobs = [{ id: 'job-1', categoryName: 'Tiling' }];
    const paymentGroups = groupPaymentInvoices([original, refund].filter(isPaymentInvoice), jobs);
    const refundGroups = groupPaymentInvoices([original, refund].filter(isRefundInvoice), jobs);

    expect(paymentGroups).toHaveLength(1);
    expect(paymentGroups[0].totalPaid).toBe(200);
    expect(paymentGroups[0].invoices.map((i) => i.id)).toEqual(['pay-200']);
    expect(invoiceDisplayLabel(original, 'job')).toMatch(/Service (deposit|payment)/);

    expect(refundGroups).toHaveLength(1);
    expect(refundGroups[0].totalPaid).toBe(186);
    expect(refundGroups[0].invoices.map((i) => i.id)).toEqual(['ref-186']);
    expect(refundGroups[0].invoices.some((i) => i.totalAmount === 200)).toBe(false);
  });

  it('Payments tab excludes type=refund invoices', () => {
    const payment = inv({ id: 'p1', type: 'labor' });
    const refund = inv({ id: 'r1', type: 'refund', status: 'refunded' });
    expect(isPaymentInvoice(payment)).toBe(true);
    expect(isPaymentInvoice(refund)).toBe(false);
    expect(isRefundInvoice(refund)).toBe(true);
  });

  it('labor status=refunded is still an original payment invoice', () => {
    const paid = inv({ type: 'materials', status: 'paid' });
    const laborRefundedStatus = inv({ type: 'labor', status: 'refunded' });
    const typed = inv({ type: 'refund', status: 'refunded' });
    expect(isRefundInvoice(paid)).toBe(false);
    expect(isRefundInvoice(laborRefundedStatus)).toBe(false);
    expect(isPaymentInvoice(laborRefundedStatus)).toBe(true);
    expect(isRefundInvoice(typed)).toBe(true);
  });

  it('labor/material/delivery invoices group by job when jobId is a known job', () => {
    const jobs = [{ id: 'job-abc', categoryName: 'Tiling' }];
    const rows = [
      inv({
        id: 'd',
        jobId: 'job-abc',
        type: 'labor',
        paymentType: 'DEPOSIT',
        totalAmount: 50,
      }),
      inv({
        id: 'c',
        jobId: 'job-abc',
        type: 'labor',
        paymentType: 'COMPLETION',
        totalAmount: 50,
        paidAt: '2026-09-15T10:00:00.000Z',
      }),
      inv({ id: 'm', jobId: 'job-abc', type: 'materials', totalAmount: 80, materialOrderId: 'mo-1' }),
      inv({ id: 'del', jobId: 'job-abc', type: 'delivery', totalAmount: 20 }),
    ];
    const groups = groupPaymentInvoices(rows, jobs);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('job');
    expect(groups[0].title).toBe('Tiling');
    expect(groups[0].invoices).toHaveLength(4);
    expect(invoiceDisplayLabel(rows[0], 'job')).toBe('Service deposit');
    expect(invoiceDisplayLabel(rows[1], 'job')).toBe('Service completion');
    expect(invoiceDisplayLabel(rows[2], 'job')).toBe('Materials purchase');
    expect(invoiceDisplayLabel(rows[3], 'job')).toBe('Delivery payment');
  });

  it('standalone material order grouping uses invoice metadata and does not invent a job', () => {
    const jobs = [{ id: 'job-abc', categoryName: 'Tiling' }];
    const rows = [
      inv({
        id: 'mat',
        jobId: '',
        type: 'materials',
        materialOrderId: 'order-99',
        storeName: 'ABC Materials',
        totalAmount: 200,
      }),
      inv({
        id: 'del',
        jobId: '',
        type: 'delivery',
        materialOrderId: 'order-99',
        storeName: 'ABC Materials',
        totalAmount: 40,
      }),
    ];
    const groups = groupPaymentInvoices(rows, jobs);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('material_order');
    expect(groups[0].title).toBe('ABC Materials');
    expect(groups[0].subtitle).toContain('order-99'.slice(-8));
    expect(invoiceDisplayLabel(rows[1], 'material_order')).toBe('Store delivery');
  });

  it('zero service jobs + leftover jobId with materialOrderId is a material order, not a service job', () => {
    const row = inv({
      id: 'mat-legacy',
      jobId: 'order-123',
      type: 'materials',
      materialOrderId: 'order-123',
      storeName: 'ABC Materials',
      totalAmount: 90,
    });
    const groups = groupPaymentInvoices([row], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('material_order');
    expect(groups[0].kind).not.toBe('job');
    expect(paymentGroupKey(row, new Set()).kind).toBe('material_order');
  });

  it('old labor invoice without new optional metadata still renders as a job group with generic service label', () => {
    const old = inv({
      id: 'legacy',
      jobId: '24f1a81f-old',
      type: 'labor',
      lineItems: [{ description: 'Labor / Service', quantity: 1, unitPrice: 50, total: 50 }],
    });
    const groups = groupPaymentInvoices([old], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('job');
    expect(groups[0].invoices[0].id).toBe('legacy');
    expect(invoiceDisplayLabel(old, 'job')).toBe('Service payment');
    expect(paymentGroupKey(old).kind).toBe('job');
  });
});
