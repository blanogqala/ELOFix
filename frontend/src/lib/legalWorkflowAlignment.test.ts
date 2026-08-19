import { describe, expect, it } from 'vitest';
import { getLegalDocument } from './legal/content';
import { LEGAL_VERSIONS } from './legal/versions';

function documentText(id: Parameters<typeof getLegalDocument>[0]): string {
  const doc = getLegalDocument(id);
  return [doc.title, ...doc.sections.flatMap((s) => [s.title, ...s.content])].join('\n');
}

describe('legal/workflow correspondence', () => {
  it('names all three live payment modes and does not claim all jobs use escrow', () => {
    const text = documentText('escrow-policy');
    expect(text).toContain('TWO_PAYMENT_50_50');
    expect(text).toContain('SINGLE_PAYMENT_UPFRONT');
    expect(text).toContain('SINGLE_PAYMENT_ON_COMPLETION');
    expect(text).toMatch(/Not all Jobs use escrow/i);
    expect(text).toMatch(/Customer payment timing is not the same as provider settlement timing/i);
    expect(LEGAL_VERSIONS.escrowPolicy).toBe('2026-08-18-r2');
  });

  it('does not promise automatic R0 forfeiture for ordinary paid service cancellation', () => {
    const refund = documentText('refund-policy');
    expect(refund).toMatch(/administrator review or cancellation dispute/i);
    expect(refund).toMatch(/A refund is not guaranteed/i);
    expect(refund).not.toMatch(/IN_PROGRESS or AWAITING_CONFIRMATION status, or active courier delivery states[\s\S]*R0 refund/);
  });

  it('keeps courier cancellation separate from ordinary service cancellation', () => {
    const refund = documentText('refund-policy');
    const delivery = documentText('delivery-policy');
    expect(refund).toMatch(/cannot cancel a courier or moving Job after items have been collected/i);
    expect(delivery).toMatch(/cannot be cancelled by the Customer after items have been collected/i);
  });

  it('distinguishes completion disputes from cancellation disputes', () => {
    const text = documentText('dispute-resolution');
    expect(text).toMatch(/Completion dispute/i);
    expect(text).toMatch(/Cancellation dispute/i);
    expect(text).toMatch(/Cancellation disputes are not limited to Awaiting Confirmation/i);
  });

  it('uses measured 30-day recovery wording and does not promise account credits', () => {
    const terms = documentText('terms');
    const refund = documentText('refund-policy');
    const provider = documentText('provider-agreement');
    for (const text of [terms, refund, provider]) {
      expect(text).not.toMatch(/WILL take legal action/i);
      expect(text).not.toMatch(/You WILL be taken to court/i);
      expect(text).not.toMatch(/EloFix may issue account credits/i);
    }
    expect(refund).toMatch(/does not operate an account-credit/i);
    expect(terms).toMatch(/Failure to settle an outstanding amount within 30 calendar days may result/i);
    expect(provider).toMatch(/Failure to settle an approved refund repayment/i);
  });
});
