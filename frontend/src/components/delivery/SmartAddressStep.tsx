import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DeliveryGeoPoint } from '@/types';
import { MapPin, Lock, LocateFixed, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { reverseGeocode } from '@/utils/geocode';

interface SmartAddressStepProps {
  collection: DeliveryGeoPoint;
  destination: DeliveryGeoPoint;
  onCollectionChange: (point: DeliveryGeoPoint) => void;
  onDestinationChange: (point: DeliveryGeoPoint) => void;
  lockCollection?: boolean;
  lockDestination?: boolean;
  lockCollectionLabel?: string;
  lockDestinationLabel?: string;
}

function AddressBlock({
  title,
  point,
  onChange,
  locked,
  lockLabel,
  locationButtonDisabled,
  onLocationUsed,
}: {
  title: string;
  point: DeliveryGeoPoint;
  onChange: (p: DeliveryGeoPoint) => void;
  locked?: boolean;
  lockLabel?: string;
  locationButtonDisabled?: boolean;
  onLocationUsed?: () => void;
}) {
  const { toast } = useToast();
  const [geoLoading, setGeoLoading] = useState(false);

  const useCurrentLocation = () => {
    if (locked || locationButtonDisabled || !navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          onChange({
            ...point,
            address: r.fullAddress || r.address,
            city: r.city,
            area: r.area ?? r.suburb,
            suburb: r.suburb,
            coordinates: r.coordinates,
          });
          onLocationUsed?.();
          toast({ title: 'Location filled', description: 'Review the address if needed.' });
        } catch {
          toast({ title: 'Could not resolve address', variant: 'destructive' });
        } finally {
          setGeoLoading(false);
        }
      },
      () => {
        setGeoLoading(false);
        toast({ title: 'Location unavailable', variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 25000 }
    );
  };

  if (locked) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </div>
        {lockLabel ? <p className="text-xs text-muted-foreground">{lockLabel}</p> : null}
        <p className="text-sm">{point.address || '—'}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 font-medium">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {title}
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={geoLoading || locationButtonDisabled}
          title={locationButtonDisabled ? 'Current location already used for the other address' : undefined}
          onClick={useCurrentLocation}
        >
          {geoLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3 mr-1" />}
          Use my location
        </Button>
      </div>
      <Input
        placeholder="Street address"
        value={point.address || ''}
        onChange={(e) => onChange({ ...point, address: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="City"
          value={point.city || ''}
          onChange={(e) => onChange({ ...point, city: e.target.value })}
        />
        <Input
          placeholder="Suburb / area"
          value={point.suburb || point.area || ''}
          onChange={(e) => onChange({ ...point, suburb: e.target.value, area: e.target.value })}
        />
      </div>
    </div>
  );
}

export function SmartAddressStep({
  collection,
  destination,
  onCollectionChange,
  onDestinationChange,
  lockCollection,
  lockDestination,
  lockCollectionLabel,
  lockDestinationLabel,
}: SmartAddressStepProps) {
  const [locationUsedFor, setLocationUsedFor] = useState<'collection' | 'destination' | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tell us where to collect and where to deliver. Locked fields come from your job or profile.
      </p>
      <AddressBlock
        title="Collection point"
        point={collection}
        onChange={onCollectionChange}
        locked={lockCollection}
        lockLabel={lockCollectionLabel}
        locationButtonDisabled={locationUsedFor === 'destination'}
        onLocationUsed={() => setLocationUsedFor('collection')}
      />
      <AddressBlock
        title="Delivery destination"
        point={destination}
        onChange={onDestinationChange}
        locked={lockDestination}
        lockLabel={lockDestinationLabel}
        locationButtonDisabled={locationUsedFor === 'collection'}
        onLocationUsed={() => setLocationUsedFor('destination')}
      />
    </div>
  );
}
