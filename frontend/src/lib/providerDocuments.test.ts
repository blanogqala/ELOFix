import { describe, expect, it } from 'vitest';
import {
  adminCanApproveProviderAccount,
  getRequiredProviderDocuments,
  hasRejectedRequiredDocuments,
  requiredDocumentsComplete,
} from './providerDocuments';
import type { Provider } from '@/types';

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

describe('passport onboarding', () => {
  it('requires work permission for passport holders and preserves SA ID requirements', () => {
    expect(getRequiredProviderDocuments({ identityType: 'PASSPORT' }).map((d) => d.id)).toContain(
      'workPermission'
    );
    expect(getRequiredProviderDocuments({ identityType: 'SA_ID' }).map((d) => d.id)).not.toContain(
      'workPermission'
    );
    const uploaded = {
      idDoc: { url: '/file.pdf' },
      companyReg: { url: '/file.pdf' },
      proofOfAddress: { url: '/file.pdf' },
    };
    expect(requiredDocumentsComplete(uploaded, { identityType: 'SA_ID' })).toBe(true);
    expect(requiredDocumentsComplete(uploaded, { identityType: 'PASSPORT' })).toBe(false);
  });

  it('blocks account approval until work permission is reviewed', () => {
    const documents = Object.fromEntries(
      getRequiredProviderDocuments({ identityType: 'PASSPORT' }).map((d) => [
        d.id,
        { url: '/file.pdf', status: 'approved' as const },
      ])
    );
    const provider = {
      identityType: 'PASSPORT',
      profileCompleted: true,
      approved: false,
      blocked: false,
      documents,
    } as unknown as Provider;
    expect(adminCanApproveProviderAccount(provider)).toBe(true);
    provider.documents.workPermission!.status = 'pending';
    expect(adminCanApproveProviderAccount(provider)).toBe(false);
    provider.documents.workPermission!.status = 'rejected';
    expect(hasRejectedRequiredDocuments(provider.documents)).toBe(true);
    delete provider.documents.workPermission;
    expect(adminCanApproveProviderAccount(provider)).toBe(false);
  });
});
