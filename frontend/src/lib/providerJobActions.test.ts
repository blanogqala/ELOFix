import { describe, expect, it } from 'vitest';
import {
  AWAITING_CONFIRMATION_MARK_COMPLETE_MSG,
  isProviderMarkCompleteDisabled,
} from '@/lib/providerJobActions';

describe('isProviderMarkCompleteDisabled', () => {
  it('blocks mark complete while waiting for customer confirmation', () => {
    expect(isProviderMarkCompleteDisabled({ status: 'AWAITING_CONFIRMATION' })).toBe(true);
    expect(AWAITING_CONFIRMATION_MARK_COMPLETE_MSG).toMatch(/confirm/i);
  });

  it('allows mark complete while the job is in progress', () => {
    expect(isProviderMarkCompleteDisabled({ status: 'IN_PROGRESS' })).toBe(false);
  });
});
