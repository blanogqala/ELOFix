import { describe, expect, it } from 'vitest';
import { formatDisputeOpenedAt, formatMessageSenderLabel } from '@/lib/disputeLabels';

describe('disputeLabels', () => {
  it('formats opened timestamp', () => {
    const label = formatDisputeOpenedAt('2026-06-28T16:00:01.000Z');
    expect(label).not.toBe('—');
    expect(label).toMatch(/2026/);
  });

  it('formats customer and provider message labels with perspective', () => {
    expect(
      formatMessageSenderLabel({
        senderRole: 'CUSTOMER',
        senderName: 'Bathandwa Nogqala',
      })
    ).toBe('Bathandwa Nogqala · Customer');

    expect(
      formatMessageSenderLabel({
        senderRole: 'PROVIDER',
        providerName: 'Arthur Nogqala',
      })
    ).toBe('Arthur Nogqala · Provider ');
  });

  it('formats admin fallback label', () => {
    expect(
      formatMessageSenderLabel({
        senderRole: 'ADMIN',
      })
    ).toBe('EloFix Admin · Admin perspective');
  });
});
