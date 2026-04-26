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
}: DeliveryOptionChooserProps) {
  const [selectedType, setSelectedType] = useState<'SELF' | 'STORE' | 'PROVIDER'>('SELF');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const hasCourierOption = deliveryProviders.length > 0;

  useEffect(() => {
    if (!hasCourierOption) {
      setSelectedType(prev => (prev === 'PROVIDER' ? 'SELF' : prev));
      setSelectedProviderId('');
    }
  }, [hasCourierOption]);

  const handleConfirm = () => {
    if (hasCourierOption && selectedType === 'PROVIDER' && !selectedProviderId) return;

    if (selectedType === 'SELF') {
      onSelect({ type: 'SELF', status: 'SelfCollect', fee: 0 });
    } else if (selectedType === 'STORE') {
      onSelect({ type: 'STORE', status: 'PendingApproval', fee: storeDeliveryFee });
    } else {
      const provider = deliveryProviders.find(p => p.id === selectedProviderId);
      if (provider) {
        onSelect({
          type: 'PROVIDER',
          status: 'PendingApproval',
          fee: provider.baseRate,
          providerId: provider.id,
        });
      }
    }
    onOpenChange(false);
    setSelectedType('SELF');
    setSelectedProviderId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Delivery Option for {storeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <RadioGroup value={selectedType} onValueChange={v => setSelectedType(v as 'SELF' | 'STORE' | 'PROVIDER')}>
            <div className="p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="SELF" id="chooser-self" />
                <Label htmlFor="chooser-self" className="cursor-pointer flex-1">
                  <p className="font-medium">I will collect myself</p>
                  <p className="text-sm text-muted-foreground">Free - Pick up from {storeName}</p>
                </Label>
              </div>
            </div>

            {storeHasDelivery && (
              <div className="p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="STORE" id="chooser-store" />
                  <Label htmlFor="chooser-store" className="cursor-pointer flex-1">
                    <div className="flex justify-between">
                      <div>
                        <p className="font-medium">Use store delivery</p>
                        <p className="text-sm text-muted-foreground">Delivered by {storeName}</p>
                      </div>
                      <p className="font-medium">{formatCurrency(storeDeliveryFee)}</p>
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
              <RadioGroup value={selectedProviderId} onValueChange={setSelectedProviderId}>
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
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={hasCourierOption && selectedType === 'PROVIDER' && !selectedProviderId}
            className="btn-accent"
          >
            <Truck className="h-3 w-3 mr-1" />
            Save Delivery Option
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
