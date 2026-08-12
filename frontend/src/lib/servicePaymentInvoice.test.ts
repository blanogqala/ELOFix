import { describe, expect, it } from 'vitest';
import type { Job, JobPaymentSummary } from '@/types';
import {
  buildProviderPaymentDetailsModel,
  buildServicePaymentInvoiceModel,
  serviceInvoiceNumber,
} from './servicePaymentInvoice';

function baseJob(overrides: Partial<Job> = {}): Job {
  return {
    id: '61ec2dc3-aaaa-bbbb-cccc-dddddddddddd',
    title: 'Tiling',
    category: 'tiling',
    categoryName: 'Tiling',
    description: 'Tile bathroom',
    status: 'COMPLETED',
    userId: 'u1',
    userName: 'Bathandwa Nogqala',
    providerId: 'p1',
    providerName: 'Arthur Nogqala',
    laborEstimateRange: { min: 1000, max: 1000 },
    materials: [],
    materialPayments: [],
    chatMessages: [],
    jobNotes: [],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-10T22:00:00.000Z',
    ...overrides,
  } as Job;
}

function fiftyFiftySummary(overrides: Partial<JobPaymentSummary> = {}): JobPaymentSummary {
  return {
    mode: 'TWO_PAYMENT_50_50',
    totalAmount: 1000,
    deposit: { amount: 500, status: 'PAID', commissionAmount: 35, providerShare: 465 },
    completion: { amount: 500, status: 'UNPAID' },
    totalPaidByCustomer: 500,
    totalRemainingByCustomer: 500,
    providerShareRecorded: 465,
    providerShareRemaining: 465,
    commissionRecorded: 35,
    paymentProgress: 'FIRST_PAID',
    label: 'COMPLETION_DUE',
    nextLaborPaymentType: 'COMPLETION',
    ...overrides,
  };
}

describe('servicePaymentInvoice helpers', () => {
  it('builds invoice number from job id', () => {
    expect(serviceInvoiceNumber('61ec2dc3-aaaa-bbbb-cccc-dddddddddddd')).toBe('EFX-61EC2DC3');
  });

  it('deposit-only shows R500 paid / R500 remaining and PARTIALLY PAID', () => {
    const job = baseJob({
      paymentModeSnapshot: 'TWO_PAYMENT_50_50',
      paymentProgress: 'FIRST_PAID',
      paymentSummary: fiftyFiftySummary(),
      depositPayment: {
        status: 'paid',
        amount: 500,
        paymentType: 'DEPOSIT',
        paidAt: '2026-08-10T10:00:00.000Z',
        paymentRef: 'EF-DEPOSIT-REF',
      },
      servicePayment: {
        status: 'paid',
        amount: 500,
        paidAt: '2026-08-10T10:00:00.000Z',
        paymentRef: 'EF-DEPOSIT-REF',
        paidBy: 'Bathandwa',
        maskedPaymentMethod: '**** **** **** 4242',
      },
    });

    const model = buildServicePaymentInvoiceModel(job);
    expect(model.serviceTotal).toBe(1000);
    expect(model.totalPaid).toBe(500);
    expect(model.balance).toBe(500);
    expect(model.status).toBe('PARTIALLY_PAID');
    expect(model.breakdown).toHaveLength(2);
    expect(model.breakdown[0].status).toBe('PAID');
    expect(model.breakdown[1].status).toBe('PENDING');
    expect(model.history).toHaveLength(1);
    expect(model.history[0].paymentRef).toBe('EF-DEPOSIT-REF');
    // Must not treat servicePayment R500 as the invoice total
    expect(model.serviceTotal).not.toBe(500);
  });

  it('fully paid shows R1000 total with two R500 history rows and distinct refs', () => {
    const job = baseJob({
      paymentModeSnapshot: 'TWO_PAYMENT_50_50',
      paymentProgress: 'FULLY_PAID',
      paymentSummary: fiftyFiftySummary({
        completion: { amount: 500, status: 'PAID', commissionAmount: 35, providerShare: 465 },
        totalPaidByCustomer: 1000,
        totalRemainingByCustomer: 0,
        providerShareRecorded: 930,
        providerShareRemaining: 0,
        commissionRecorded: 70,
        paymentProgress: 'FULLY_PAID',
        label: 'FULLY_PAID',
        nextLaborPaymentType: null,
      }),
      depositPayment: {
        status: 'paid',
        amount: 500,
        paymentType: 'DEPOSIT',
        paidAt: '2026-08-10T10:00:00.000Z',
        paymentRef: 'EF-DEPOSIT-AAA',
        commissionAmount: 35,
        recipientAmount: 465,
      },
      completionPayment: {
        status: 'paid',
        amount: 500,
        paymentType: 'COMPLETION',
        paidAt: '2026-08-10T21:50:00.000Z',
        paymentRef: 'EF-COMPLETION-BBB',
        commissionAmount: 35,
        recipientAmount: 465,
      },
      // Stale first-tranche snapshot — must not win as invoice total
      servicePayment: {
        status: 'paid',
        amount: 500,
        paidAt: '2026-08-10T10:00:00.000Z',
        paymentRef: 'EF-DEPOSIT-AAA',
        paidBy: 'Bathandwa',
        maskedPaymentMethod: '**** **** **** 4242',
      },
    });

    const model = buildServicePaymentInvoiceModel(job);
    expect(model.serviceTotal).toBe(1000);
    expect(model.totalPaid).toBe(1000);
    expect(model.balance).toBe(0);
    expect(model.status).toBe('FULLY_PAID');
    expect(model.history).toHaveLength(2);
    expect(model.history[0].paymentRef).toBe('EF-DEPOSIT-AAA');
    expect(model.history[1].paymentRef).toBe('EF-COMPLETION-BBB');
    expect(model.history[0].paymentRef).not.toBe(model.history[1].paymentRef);
  });

  it('provider model separates customer paid, commission, and share', () => {
    const job = baseJob({
      paymentSummary: fiftyFiftySummary({
        completion: { amount: 500, status: 'PAID', commissionAmount: 35, providerShare: 465 },
        totalPaidByCustomer: 1000,
        totalRemainingByCustomer: 0,
        providerShareRecorded: 930,
        providerShareRemaining: 0,
        commissionRecorded: 70,
        paymentProgress: 'FULLY_PAID',
        label: 'FULLY_PAID',
      }),
    });

    const model = buildProviderPaymentDetailsModel(job);
    expect(model.serviceTotal).toBe(1000);
    expect(model.customerTotalPaid).toBe(1000);
    expect(model.commissionRecorded).toBe(70);
    expect(model.providerShareRecorded).toBe(930);
    expect(model.providerShareRemaining).toBe(0);
    expect(model.providerShareRecorded).not.toBe(model.serviceTotal);
  });
});
