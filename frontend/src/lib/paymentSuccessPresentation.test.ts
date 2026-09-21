import { describe, expect, it } from 'vitest';
import {
  paymentProviderDisplayName,
  paymentSuccessCopy,
  paymentSuccessDonePath,
  paymentSuccessReceiptPath,
} from '@/lib/paymentSuccessPresentation';

describe('paymentSuccessCopy', () => {
  it('maps LABOR + DEPOSIT to deposit copy', () => {
    const copy = paymentSuccessCopy({ kind: 'LABOR', paymentType: 'DEPOSIT' });
    expect(copy.title).toBe('Deposit payment successful');
    expect(copy.description).toBe('Your deposit payment has been completed successfully.');
    expect(copy.paymentLabel).toBe('Deposit · 50%');
  });

  it('maps LABOR + COMPLETION to completion copy', () => {
    const copy = paymentSuccessCopy({ kind: 'LABOR', paymentType: 'COMPLETION' });
    expect(copy.title).toBe('Completion payment successful');
    expect(copy.description).toBe('Your final job payment has been completed successfully.');
    expect(copy.paymentLabel).toBe('Completion · 50%');
  });

  it('maps FULL_UPFRONT without saying deposit', () => {
    const copy = paymentSuccessCopy({ kind: 'LABOR', paymentType: 'FULL_UPFRONT' });
    expect(copy.title).toBe('Payment successful');
    expect(copy.description).toMatch(/full upfront payment/i);
  });

  it('maps FULL_COMPLETION without saying deposit', () => {
    const copy = paymentSuccessCopy({ kind: 'LABOR', paymentType: 'FULL_COMPLETION' });
    expect(copy.title).toBe('Payment successful');
    expect(copy.description).toMatch(/job payment has been completed/i);
  });

  it('maps MATERIAL_ORDER and JOB_STORE_ORDER to materials copy', () => {
    expect(paymentSuccessCopy({ kind: 'MATERIAL_ORDER' }).title).toBe('Materials payment successful');
    expect(paymentSuccessCopy({ kind: 'JOB_STORE_ORDER' }).title).toBe('Materials payment successful');
    expect(paymentSuccessCopy({ kind: 'MATERIAL_ORDER' }).description).toMatch(/materials order payment/i);
    expect(paymentSuccessCopy({ kind: 'JOB_STORE_ORDER' }).description).toMatch(/job materials payment/i);
  });

  it('maps DELIVERY_FEE to delivery copy', () => {
    const copy = paymentSuccessCopy({ kind: 'DELIVERY_FEE' });
    expect(copy.title).toBe('Delivery payment successful');
    expect(copy.description).toMatch(/delivery payment has been completed/i);
  });

  it('maps PROVIDER_REFUND_REPAYMENT as a provider repayment, not a customer refund', () => {
    const copy = paymentSuccessCopy({ kind: 'PROVIDER_REFUND_REPAYMENT' });
    expect(copy.title).toBe('Refund repayment successful');
    expect(copy.description).toMatch(/refund repayment to EloFix/i);
    expect(copy.description).not.toMatch(/customer refund successful/i);
    expect(copy.isProviderRefundRepayment).toBe(true);
    expect(copy.paymentLabel).toBe('Refund repayment');
  });
});

describe('paymentSuccess navigation', () => {
  it('sends job-linked customer payments to Job Details, not Dashboard', () => {
    expect(
      paymentSuccessDonePath({
        jobId: 'job-1',
        kind: 'LABOR',
        paymentType: 'DEPOSIT',
        role: 'user',
      })
    ).toBe('/user/jobs/job-1');
  });

  it('sends provider refund repayment Done to the provider Job Details page', () => {
    expect(
      paymentSuccessDonePath({
        jobId: 'job-9',
        kind: 'PROVIDER_REFUND_REPAYMENT',
        role: 'provider',
      })
    ).toBe('/provider/jobs/job-9');
  });

  it('sends View receipt to customer Payments with the payment intent id', () => {
    expect(
      paymentSuccessReceiptPath({
        paymentIntentId: 'pi-1',
        jobId: 'job-1',
        kind: 'LABOR',
        paymentType: 'DEPOSIT',
        role: 'user',
      })
    ).toBe('/user/payments?payment=pi-1');
  });

  it('sends provider View receipt to the job refund repayment screen', () => {
    expect(
      paymentSuccessReceiptPath({
        paymentIntentId: 'pi-rr',
        jobId: 'job-9',
        kind: 'PROVIDER_REFUND_REPAYMENT',
        role: 'provider',
      })
    ).toBe('/provider/jobs/job-9/refund?payment=pi-rr');
  });
});

describe('paymentProviderDisplayName', () => {
  it('maps known providers without exposing raw gateway payloads', () => {
    expect(paymentProviderDisplayName('PAYSTACK')).toBe('Paystack');
    expect(paymentProviderDisplayName(null)).toBeNull();
  });
});
