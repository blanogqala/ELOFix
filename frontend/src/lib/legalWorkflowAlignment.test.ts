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
    expect(text).toMatch(/not a bank, deposit-taker, wallet provider, insurer, or escrow agent/i);
    expect(text).toMatch(/Successful Customer payment does not mean immediate bank credit/i);
    expect(LEGAL_VERSIONS.escrowPolicy).toBe('2026-10-05');
  });

  it('describes payment-based confirmation, day-seven restrictions, and day-37 review', () => {
    const text = documentText('job-completion-verification');
    expect(text).toMatch(/verified payment of the final 50%/i);
    expect(text).toMatch(/7-day confirmation deadline restricts new service requests/i);
    expect(text).toContain('(day 37)');
    expect(text).toMatch(/Silence does not confirm completion or authorize a charge/i);
    expect(text).toMatch(/Legal proceedings are not started automatically/i);
    expect(text).toMatch(/unrelated account restrictions remain/i);
    expect(text).not.toMatch(/Silence = Acceptance|constitutes acceptance|neutral trust score/i);
    for (const id of ['provider-agreement', 'refund-policy', 'corrective-work'] as const) {
      expect(documentText(id)).not.toMatch(/automatically approved|allow automatic acceptance/i);
    }
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
