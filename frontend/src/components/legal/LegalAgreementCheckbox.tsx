import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  LEGAL_LABELS,
  LEGAL_REQUIRE_SCROLL,
  LEGAL_ROUTES,
  getRequiredDocuments,
  type LegalDocumentId,
} from '@/lib/legal/versions';
import { hasScrolledAllDocuments } from '@/lib/legal/scrollTracking';

interface LegalAgreementCheckboxProps {
  role: 'user' | 'provider';
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function LegalAgreementCheckbox({
  role,
  checked,
  onCheckedChange,
  disabled = false,
}: LegalAgreementCheckboxProps) {
  const requiredDocs = getRequiredDocuments(role);
  const [scrollReady, setScrollReady] = useState(
    !LEGAL_REQUIRE_SCROLL || hasScrolledAllDocuments(requiredDocs)
  );

  useEffect(() => {
    if (!LEGAL_REQUIRE_SCROLL) {
      setScrollReady(true);
      return;
    }

    const interval = window.setInterval(() => {
      setScrollReady(hasScrolledAllDocuments(requiredDocs));
    }, 500);

    return () => window.clearInterval(interval);
  }, [requiredDocs]);

  const canAccept = scrollReady && !disabled;

  const handleCheckedChange = (value: boolean) => {
    if (!canAccept && value) return;
    onCheckedChange(value);
  };

  const renderDocLink = (docId: LegalDocumentId, label?: string) => (
    <Link
      key={docId}
      to={LEGAL_ROUTES[docId]}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary hover:underline"
    >
      {label ?? LEGAL_LABELS[docId]}
    </Link>
  );

  const customerLabel = (
    <>
      I agree to the {renderDocLink('terms')} and {renderDocLink('privacy')}
    </>
  );

  const providerLabel = (
    <>
      I agree to the {renderDocLink('terms')}, {renderDocLink('privacy')},{' '}
      {renderDocLink('provider-agreement', 'Provider Agreement')}, and{' '}
      {renderDocLink('refund-policy', 'Refund Policy')}
    </>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <Checkbox
          id="legal-agreement"
          checked={checked}
          onCheckedChange={(value) => handleCheckedChange(value === true)}
          disabled={!canAccept}
          className="mt-0.5"
        />
        <label
          htmlFor="legal-agreement"
          className={cn(
            'text-sm leading-relaxed',
            canAccept ? 'text-muted-foreground cursor-pointer' : 'text-muted-foreground/70 cursor-not-allowed'
          )}
        >
          {role === 'provider' ? providerLabel : customerLabel}
        </label>
      </div>

      {LEGAL_REQUIRE_SCROLL && !scrollReady && (
        <p className="text-xs text-muted-foreground pl-7">
          Please open each linked document and scroll to the bottom before accepting.{' '}
          {requiredDocs.map((docId, index) => (
            <span key={docId}>
              {index > 0 && (index === requiredDocs.length - 1 ? ', and ' : ', ')}
              {renderDocLink(docId)}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
