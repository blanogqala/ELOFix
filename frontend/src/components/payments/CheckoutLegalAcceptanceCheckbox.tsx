import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { LEGAL_LABELS, LEGAL_ROUTES } from '@/lib/legal/versions';
import { checkoutRequiresDeliveryPolicy } from '@/lib/legal/checkoutAcceptance';
import type { PaymentIntentKind } from '@/lib/api/payments';

interface CheckoutLegalAcceptanceCheckboxProps {
  kind: PaymentIntentKind;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Transaction-specific FNB checkout acknowledgement.
 * Separate from account-level registration Terms/Privacy acceptance.
 */
export function CheckoutLegalAcceptanceCheckbox({
  kind,
  checked,
  onCheckedChange,
  disabled = false,
  id = 'checkout-legal-acceptance',
}: CheckoutLegalAcceptanceCheckboxProps) {
  const requiresDelivery = checkoutRequiresDeliveryPolicy(kind);

  const refundLink = (
    <Link
      to={LEGAL_ROUTES['refund-policy']}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {LEGAL_LABELS['refund-policy']}
    </Link>
  );

  const deliveryLink = (
    <Link
      to={LEGAL_ROUTES['delivery-policy']}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {LEGAL_LABELS['delivery-policy']}
    </Link>
  );

  const label = requiresDelivery ? (
    <>
      I have read and accept the {refundLink} and acknowledge the {deliveryLink} applicable to this
      order.
    </>
  ) : (
    <>I have read and accept the {refundLink} applicable to this payment.</>
  );

  return (
    <div className="flex items-start gap-3 min-w-0">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className="mt-0.5 shrink-0"
        aria-required
      />
      <label
        htmlFor={id}
        className={cn(
          'text-sm leading-relaxed min-w-0 break-words',
          disabled ? 'text-muted-foreground/70 cursor-not-allowed' : 'text-muted-foreground cursor-pointer'
        )}
      >
        {label}
      </label>
    </div>
  );
}
