import { PublicLayout } from '@/components/layout/PublicLayout';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';
import { getLegalDocument } from '@/lib/legal/content';
import type { LegalDocumentId } from '@/lib/legal/versions';

interface LegalDocumentPageProps {
  documentId: LegalDocumentId;
}

export function LegalDocumentPage({ documentId }: LegalDocumentPageProps) {
  return (
    <PublicLayout wide>
      <LegalPageLayout document={getLegalDocument(documentId)} />
    </PublicLayout>
  );
}

export function createLegalPage(documentId: LegalDocumentId) {
  return function LegalPage() {
    return <LegalDocumentPage documentId={documentId} />;
  };
}
