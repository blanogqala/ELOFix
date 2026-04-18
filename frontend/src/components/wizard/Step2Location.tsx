import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { JobLocation } from '@/types';
import { MapPin } from 'lucide-react';

interface Step2LocationProps {
  location: Partial<JobLocation>;
  setLocation: (loc: Partial<JobLocation>) => void;
}

export function Step2Location({ location, setLocation }: Step2LocationProps) {
  const update = (field: keyof JobLocation, value: string | undefined) => {
    setLocation({ ...location, [field]: value });
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
            Map pin selection will be available in a future update. For now, please provide the address details above.
          </p>
        </div>
      </div>
    </div>
  );
}
