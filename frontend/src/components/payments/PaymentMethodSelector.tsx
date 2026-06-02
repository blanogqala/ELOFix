import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { PaymentProvider } from '@/lib/api/payments';
import { cn } from '@/lib/utils';
import { CreditCard, Wallet } from 'lucide-react';

const PROVIDER_META: Record<
  PaymentProvider,
  { label: string; description: string }
> = {
  PAYFAST: {
    label: 'PayFast',
    description: 'Card, EFT, and instant EFT',
  },
  PAYFLEX: {
    label: 'Payflex',
    description: 'Pay in 4 interest-free instalments',
  },
  PAYJUSTNOW: {
    label: 'PayJustNow',
    description: 'Buy now, pay later',
  },
};

interface PaymentMethodSelectorProps {
  value: PaymentProvider | '';
  onChange: (provider: PaymentProvider) => void;
  availableProviders: PaymentProvider[];
  disabled?: boolean;
}

export function PaymentMethodSelector({
  value,
  onChange,
  availableProviders,
  disabled,
}: PaymentMethodSelectorProps) {
  if (availableProviders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No payment providers are configured. Contact support.
      </p>
    );
  }

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as PaymentProvider)}
      className="space-y-2"
      disabled={disabled}
    >
      {availableProviders.map((provider) => {
        const meta = PROVIDER_META[provider];
        return (
          <div
            key={provider}
            className={cn(
              'flex items-start space-x-3 p-3 border rounded-lg transition-colors',
              value === provider ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <RadioGroupItem value={provider} id={`provider-${provider}`} className="mt-1" />
            <Label htmlFor={`provider-${provider}`} className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2 font-medium">
                {provider === 'PAYFAST' ? (
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                )}
                {meta.label}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}
