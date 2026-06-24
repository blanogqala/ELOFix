import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { LEGAL_CATEGORIES, LEGAL_LABELS, LEGAL_ROUTES } from '@/lib/legal/versions';
import type { LegalDocumentCategory } from '@/lib/legal/versions';

const CATEGORY_ORDER: LegalDocumentCategory[] = [
  'marketplace',
  'payments',
  'privacy',
  'providers',
  'suppliers',
  'safety',
];

export default function LegalIndexPage() {
  return (
    <PublicLayout wide>
      <div className="container max-w-4xl py-8 md:py-12">
        <header className="mb-10 border-b border-border pb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            EloFix Legal Centre
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Legal Policies
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            All legal documents governing use of the EloFix marketplace. Effective June 24, 2026.
          </p>
        </header>

        <div className="space-y-10">
          {CATEGORY_ORDER.map((categoryId) => {
            const category = LEGAL_CATEGORIES[categoryId];
            return (
              <section key={categoryId}>
                <h2 className="mb-4 text-lg font-semibold text-foreground">{category.label}</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {category.documents.map((docId) => (
                    <li key={docId}>
                      <Link
                        to={LEGAL_ROUTES[docId]}
                        className="flex items-center rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        {LEGAL_LABELS[docId]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </PublicLayout>
  );
}
