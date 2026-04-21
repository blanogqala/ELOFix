import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { JobLocation } from '@/types';
import { MapPin, LocateFixed } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { reverseGeocode } from '@/lib/api/geocode';

interface Step2LocationProps {
  location: Partial<JobLocation>;
  setLocation: (loc: Partial<JobLocation>) => void;
}

export function Step2Location({ location, setLocation }: Step2LocationProps) {
  const { toast } = useToast();
  const [geoLoading, setGeoLoading] = useState(false);

  const update = (field: keyof JobLocation, value: string | undefined) => {
    setLocation({ ...location, [field]: value });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Not supported',
        description: 'Your browser does not support geolocation.',
        variant: 'destructive',
      });
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const r = await reverseGeocode(latitude, longitude);
          setLocation({
            ...location,
            address: r.address,
            city: r.city,
            area: r.area || r.suburb,
            suburb: r.suburb || r.area,
            coordinates: r.coordinates,
          });
          toast({
            title: 'Location filled',
            description: 'Review and adjust the address if needed.',
          });
        } catch (error) {
          setLocation({
            ...location,
            coordinates: { lat: latitude, lng: longitude },
          });
          toast({
            title: 'Could not resolve address',
            description:
              error instanceof Error ? error.message : 'Coordinates saved — please enter the address manually.',
            variant: 'destructive',
          });
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoLoading(false);
        toast({
          title: 'Location unavailable',
          description: err.message || 'Permission denied or timeout.',
          variant: 'destructive',
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Service Location</h2>
        <p className="text-muted-foreground">
          Where should the provider come for the inspection and work?
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={useCurrentLocation}
            disabled={geoLoading}
          >
            <LocateFixed className="h-4 w-4" />
            {geoLoading ? 'Getting location…' : 'Use Current Location'}
          </Button>
          {location.coordinates && (
            <span className="text-xs text-muted-foreground">
              {location.coordinates.lat.toFixed(5)}, {location.coordinates.lng.toFixed(5)}
            </span>
          )}
        </div>

        <div>
          <Label htmlFor="address">Full Address</Label>
          <Input
            id="address"
            placeholder="e.g. 123 Main Street, Unit 4"
            value={location.address || ''}
            onChange={(e) => update('address', e.target.value)}
            className="input-field mt-2"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              placeholder="e.g. Cape Town"
              value={location.city || ''}
              onChange={(e) => update('city', e.target.value)}
              className="input-field mt-2"
            />
          </div>
          <div>
            <Label htmlFor="area">Area / Suburb</Label>
            <Input
              id="area"
              placeholder="e.g. Claremont, Sandton"
              value={location.area || location.suburb || ''}
              onChange={(e) => {
                const v = e.target.value;
                update('area', v);
                update('suburb', v);
              }}
              className="input-field mt-2"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes">Notes for Finding the Place (Optional)</Label>
          <Textarea
            id="notes"
            placeholder="e.g. Gate code, landmarks, parking instructions..."
            value={location.notes || ''}
            onChange={(e) => update('notes', e.target.value)}
            className="textarea-field mt-2"
            rows={3}
          />
        </div>

        <div className="p-4 bg-muted/50 rounded-lg flex items-center gap-3">
          <MapPin className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            You can use your current location to fill the address automatically, or enter it manually.
          </p>
        </div>
      </div>
    </div>
  );
}
