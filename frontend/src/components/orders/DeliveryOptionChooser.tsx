import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Truck } from 'lucide-react';
import { DeliveryProvider } from '@/types';

export interface DeliveryOptionSelection {
  type: 'SELF' | 'STORE' | 'PROVIDER';
  status: string;
  fee: number;
  providerId?: string;
}

interface DeliveryOptionChooserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName: string;
  storeId: string;
  storeHasDelivery: boolean;
  storeDeliveryFee?: number;
  deliveryProviders: DeliveryProvider[];
  deliveryProvidersError?: string | null;
  onSelect: (delivery: DeliveryOptionSelection) => void;
  /** When changing from self-pickup, hide the collect-yourself option. */
  hideSelfOption?: boolean;
}

export function DeliveryOptionChooser({
  open,
  onOpenChange,
  storeName,
  storeHasDelivery,
  storeDeliveryFee = 0,
  deliveryProviders,
  deliveryProvidersError,
  onSelect,
  hideSelfOption = false,
}: DeliveryOptionChooserProps) {
  const hasCourierOption = deliveryProviders.length > 0;
  const defaultType = (): 'SELF' | 'STORE' | 'PROVIDER' => {
    if (hideSelfOption) {
      if (storeHasDelivery) return 'STORE';
      if (hasCourierOption) return 'PROVIDER';
    }
    return 'SELF';
  };

  const [selectedType, setSelectedType] = useState<'SELF' | 'STORE' | 'PROVIDER'>(defaultType);
  const [selectedProviderId, setSelectedProviderId] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedType(defaultType());
    setSelectedProviderId('');
  }, [open, hideSelfOption, storeHasDelivery, hasCourierOption]);

  useEffect(() => {
    if (!hasCourierOption) {
      setSelectedType(prev => (prev === 'PROVIDER' ? defaultType() : prev));
      setSelectedProviderId('');
    }
  }, [hasCourierOption]);

  const handleConfirm = () => {
    if (hasCourierOption && selectedType === 'PROVIDER' && !selectedProviderId) return;

    if (selectedType === 'SELF') {
      onSelect({ type: 'SELF', status: 'SelfCollect', fee: 0 });
    } else if (selectedType === 'STORE') {
      onSelect({ type: 'STORE', status: 'PendingApproval', fee: 0 });
    } else {
      const provider = deliveryProviders.find(p => p.id === selectedProviderId);
      if (provider) {
        onSelect({
          type: 'PROVIDER',
          status: 'PendingApproval',
          fee: 0,
          providerId: provider.id,
        });
      }
    }
    onOpenChange(false);
    setSelectedType(defaultType());
    setSelectedProviderId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>
            {hideSelfOption ? `Change delivery option for ${storeName}` : `Choose Delivery Option for ${storeName}`}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-2">
          <RadioGroup value={selectedType} onValueChange={v => setSelectedType(v as 'SELF' | 'STORE' | 'PROVIDER')}>
            {!hideSelfOption ? (
            <div className="p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="SELF" id="chooser-self" />
                <Label htmlFor="chooser-self" className="cursor-pointer flex-1">
                  <p className="font-medium">I will collect myself</p>
                  <p className="text-sm text-muted-foreground">Free - Pick up from {storeName}</p>
                </Label>
              </div>
            </div>
            ) : null}

            {storeHasDelivery && (
              <div className="p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="STORE" id="chooser-store" />
                  <Label htmlFor="chooser-store" className="cursor-pointer flex-1">
                    <div className="flex justify-between">
                      <div>
                        <p className="font-medium">Use store delivery</p>
                        <p className="text-sm text-muted-foreground">
                          Price confirmed by the branch after your request
                        </p>
                      </div>
                    </div>
                  </Label>
                </div>
              </div>
            )}

            {hasCourierOption && (
              <div className="p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="PROVIDER" id="chooser-provider" />
                  <Label htmlFor="chooser-provider" className="cursor-pointer flex-1">
                    <p className="font-medium">Hire a delivery provider</p>
                    <p className="text-sm text-muted-foreground">Choose from available delivery providers</p>
                  </Label>
                </div>
              </div>
            )}
          </RadioGroup>

          {hasCourierOption && selectedType === 'PROVIDER' && (
            <div className="space-y-2">
              <Label>Select a provider</Label>
              {deliveryProvidersError && (
                <p className="text-xs text-destructive">{deliveryProvidersError}</p>
              )}
              <div className="max-h-[min(40vh,280px)] overflow-y-auto rounded-md border border-border/60 pr-1">
              <RadioGroup value={selectedProviderId} onValueChange={setSelectedProviderId} className="space-y-2 p-2">
                {deliveryProviders.map(provider => (
                  <div
                    key={provider.id}
                    className="flex items-center space-x-3 p-3 border border-border rounded-lg"
                  >
                    <RadioGroupItem value={provider.id} id={provider.id} />
                    <Label htmlFor={provider.id} className="flex-1 cursor-pointer">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">{provider.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[provider.vehicleType, provider.rating != null && `★ ${provider.rating}`, `ETA: ${provider.estimatedTime}`].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <p className="font-medium">{formatCurrency(provider.baseRate)}</p>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={hasCourierOption && selectedType === 'PROVIDER' && !selectedProviderId}
            className="btn-accent"
          >
            <Truck className="h-3 w-3 mr-1" />
            {selectedType === 'PROVIDER' ? 'Request provider' : 'Save Delivery Option'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
