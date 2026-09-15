import { describe, expect, it } from 'vitest';
import { feeIsKnown } from '@/lib/payoutDisplay';
import {
  recipientGrossSharePreview,
  twoPaymentStagePreview,
} from '@/lib/recipientGrossSharePreview';

describe('recipientGrossSharePreview', () => {
  it('splits R100 into 7% commission and 93% gross share', () => {
    expect(recipientGrossSharePreview(100)).toEqual({
      customerPrice: 100,
      commission: 7,
      grossShare: 93,
    });
  });

  it('splits TWO_PAYMENT_50_50 R100 into two 50/3.50/46.50 stages', () => {
    const stages = twoPaymentStagePreview(100);
    expect(stages.total).toBe(100);
    expect(stages.deposit).toEqual({ customerPrice: 50, commission: 3.5, grossShare: 46.5 });
    expect(stages.completion).toEqual({ customerPrice: 50, commission: 3.5, grossShare: 46.5 });
  });

  it('splits supplier materials R50 into 3.50 commission and 46.50 gross share', () => {
    expect(recipientGrossSharePreview(50)).toEqual({
      customerPrice: 50,
      commission: 3.5,
      grossShare: 46.5,
    });
  });

  it('does not invent a Paystack processor fee', () => {
    const preview = recipientGrossSharePreview(100);
    expect(preview).not.toHaveProperty('processorFeeAmount');
    expect(preview).not.toHaveProperty('expectedBankSettlementAmount');
    expect(feeIsKnown(null)).toBe(false);
    expect(feeIsKnown(undefined)).toBe(false);
    expect(feeIsKnown(2.82)).toBe(true);
  });
});
