import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  LEGAL_LABELS,
  LEGAL_ROUTES,
  type LegalDocumentId,
} from '@/lib/legal/versions';

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
    <div className="flex items-start gap-3">
      <Checkbox
        id="legal-agreement"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <label
        htmlFor="legal-agreement"
        className={cn(
          'text-sm leading-relaxed',
          disabled ? 'text-muted-foreground/70 cursor-not-allowed' : 'text-muted-foreground cursor-pointer'
        )}
      >
        {role === 'provider' ? providerLabel : customerLabel}
      </label>
    </div>
  );
}
