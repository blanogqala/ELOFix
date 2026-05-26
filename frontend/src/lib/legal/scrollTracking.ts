import type { LegalDocumentId } from './versions';
import { LEGAL_VERSIONS } from './versions';

const STORAGE_PREFIX = 'elofix-legal-scrolled';

function versionForDoc(docId: LegalDocumentId): string {
  switch (docId) {
    case 'terms':
      return LEGAL_VERSIONS.terms;
    case 'privacy':
      return LEGAL_VERSIONS.privacy;
    case 'provider-agreement':
      return LEGAL_VERSIONS.providerAgreement;
    case 'refund-policy':
      return LEGAL_VERSIONS.refundPolicy;
    default:
      return LEGAL_VERSIONS.terms;
  }
}

function storageKey(docId: LegalDocumentId): string {
  return `${STORAGE_PREFIX}-${docId}-v${versionForDoc(docId)}`;
}

export function markDocumentScrolled(docId: LegalDocumentId): void {
  try {
    sessionStorage.setItem(storageKey(docId), 'true');
  } catch {
    /* ignore storage errors */
  }
}

export function hasScrolledDocument(docId: LegalDocumentId): boolean {
  try {
    return sessionStorage.getItem(storageKey(docId)) === 'true';
  } catch {
    return false;
  }
}

export function hasScrolledAllDocuments(docIds: LegalDocumentId[]): boolean {
  return docIds.every((id) => hasScrolledDocument(id));
}
