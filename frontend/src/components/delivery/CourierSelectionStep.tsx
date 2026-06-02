import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { DeliveryProvider } from '@/types';

interface CourierSelectionStepProps {
  providers: DeliveryProvider[];
  selectedCourierId: string;
  onSelectCourier: (id: string) => void;
  error?: string | null;
  loading?: boolean;
}

export function CourierSelectionStep({
  providers,
  selectedCourierId,
  onSelectCourier,
  error,
  loading,
}: CourierSelectionStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Choose a courier</h2>
        <p className="text-muted-foreground text-sm">
          Registered couriers will send a delivery quote before you pay.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading couriers…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : providers.length === 0 ? (
        <p className="text-sm text-destructive">No couriers available right now. Try again later.</p>
      ) : (
        <RadioGroup value={selectedCourierId} onValueChange={onSelectCourier}>
          {providers.map((p) => (
            <div key={p.id} className="flex items-center space-x-3 p-3 border rounded-lg">
              <RadioGroupItem value={p.id} id={`courier-${p.id}`} />
              <Label htmlFor={`courier-${p.id}`} className="cursor-pointer flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[p.vehicleType, p.numberPlate, p.rating != null && `★ ${p.rating}`, p.estimatedTime && `ETA: ${p.estimatedTime}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}
    </div>
  );
}
