import { describe, expect, it } from 'vitest';
import {
  SUPPLIER_GROSS_SHARE_LABEL,
  SUPPLIER_PENDING_SETTLEMENT_HINT,
  SUPPLIER_SETTLED_HINT,
  SUPPLIER_SETTLED_LABEL,
  pendingSettlementHelperText,
} from '@/lib/supplierSettlementKpiDisplay';

describe('supplierSettlementKpiDisplay', () => {
  it('labels 93% as gross share, not net bank credit', () => {
    expect(SUPPLIER_GROSS_SHARE_LABEL).toMatch(/Gross supplier earnings \(93%\)/);
    expect(SUPPLIER_GROSS_SHARE_LABEL.toLowerCase()).not.toContain('total net earnings');
  });

  it('describes pending and settled Paystack buckets', () => {
    expect(SUPPLIER_PENDING_SETTLEMENT_HINT).toBe('Paystack payouts pending or processing');
    expect(SUPPLIER_SETTLED_LABEL).toBe('Settled by Paystack');
    expect(SUPPLIER_SETTLED_HINT).toBe('Completed Paystack settlements');
  });

  it('does not imply a gross fallback is the final bank amount', () => {
    const text = pendingSettlementHelperText(true);
    expect(text).toContain('not the final bank amount');
    expect(text).toContain('Paystack fee is not yet confirmed');
  });
});
