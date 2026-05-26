import { PublicLayout } from '@/components/layout/PublicLayout';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';
import { getLegalDocument } from '@/lib/legal/content';

export default function RefundPolicyPage() {
  return (
    <PublicLayout wide>
      <LegalPageLayout document={getLegalDocument('refund-policy')} />
    </PublicLayout>
  );
}
