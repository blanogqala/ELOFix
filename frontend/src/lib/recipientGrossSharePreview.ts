/** EloFix marketplace commission. Do not derive a Paystack processor fee from this. */
export const ELOFIX_COMMISSION_RATE = 0.07;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type RecipientGrossSharePreview = {
  customerPrice: number;
  commission: number;
  grossShare: number;
};

export function recipientGrossSharePreview(customerPrice: number): RecipientGrossSharePreview {
  const price = roundMoney(Math.max(0, Number(customerPrice) || 0));
  const commission = roundMoney(price * ELOFIX_COMMISSION_RATE);
  const grossShare = roundMoney(price - commission);
  return { customerPrice: price, commission, grossShare };
}

export function twoPaymentStagePreview(totalCustomerPrice: number): {
  total: number;
  deposit: RecipientGrossSharePreview;
  completion: RecipientGrossSharePreview;
} {
  const total = roundMoney(Math.max(0, Number(totalCustomerPrice) || 0));
  const depositAmount = roundMoney(total / 2);
  const completionAmount = roundMoney(total - depositAmount);
  return {
    total,
    deposit: recipientGrossSharePreview(depositAmount),
    completion: recipientGrossSharePreview(completionAmount),
  };
}
