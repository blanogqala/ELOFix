import { describe, expect, it } from 'vitest';
import {
  formatSupplierSettlementLabel,
  normalizeSupplierSettlementStatus,
  supplierSettlementBadgeClass,
} from '@/lib/supplierOrdersSettlementDisplay';

describe('supplierOrdersSettlementDisplay', () => {
  it('maps backend payout states onto the three supplier labels', () => {
    expect(normalizeSupplierSettlementStatus('PENDING')).toBe('PENDING');
    expect(normalizeSupplierSettlementStatus('PROCESSING')).toBe('PROCESSING');
    expect(normalizeSupplierSettlementStatus('SETTLED')).toBe('SUCCESS');
    expect(normalizeSupplierSettlementStatus('SUCCESS')).toBe('SUCCESS');
    expect(formatSupplierSettlementLabel('PENDING')).toBe('Pending');
    expect(formatSupplierSettlementLabel('PROCESSING')).toBe('Processing');
    expect(formatSupplierSettlementLabel('SUCCESS')).toBe('Success');
    expect(formatSupplierSettlementLabel('SETTLED')).toBe('Success');
  });

  it('keeps unsuccessful terminal payouts visually non-success', () => {
    expect(normalizeSupplierSettlementStatus('FAILED')).toBe('PENDING');
    expect(normalizeSupplierSettlementStatus('REVERSED')).toBe('PENDING');
    expect(formatSupplierSettlementLabel('FAILED')).toBe('Pending');
  });

  it('uses semantic badge classes for pending, processing, and success', () => {
    expect(supplierSettlementBadgeClass('PENDING')).toContain('amber');
    expect(supplierSettlementBadgeClass('PROCESSING')).toContain('sky');
    expect(supplierSettlementBadgeClass('SUCCESS')).toContain('emerald');
  });
});
