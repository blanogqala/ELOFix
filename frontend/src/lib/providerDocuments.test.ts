import { describe, expect, it } from 'vitest';
import { hasRejectedRequiredDocuments } from './providerDocuments';

describe('hasRejectedRequiredDocuments', () => {
  it('returns true when a required document is rejected', () => {
    expect(
      hasRejectedRequiredDocuments({
        idDoc: { url: '/files/id.pdf', status: 'approved' },
        companyReg: { url: '/files/reg.pdf', status: 'rejected' },
        proofOfAddress: { url: '/files/addr.pdf', status: 'pending' },
      })
    ).toBe(true);
  });

  it('returns false when no required documents are rejected', () => {
    expect(
      hasRejectedRequiredDocuments({
        idDoc: { url: '/files/id.pdf', status: 'approved' },
        companyReg: { url: '/files/reg.pdf', status: 'pending' },
        proofOfAddress: { url: '/files/addr.pdf', status: 'approved' },
      })
    ).toBe(false);
  });

  it('returns false when documents are undefined', () => {
    expect(hasRejectedRequiredDocuments(undefined)).toBe(false);
  });
});
