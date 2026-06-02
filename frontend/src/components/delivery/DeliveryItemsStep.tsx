import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { uploadJobImage } from '@/lib/api/jobs';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import type { DeliveryRequestItem } from '@/types';
import { Plus, Trash2, Upload, X } from 'lucide-react';

interface DeliveryItemsStepProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  items: DeliveryRequestItem[];
  onItemsChange: (items: DeliveryRequestItem[]) => void;
  images: string[];
  onImagesChange: (images: string[]) => void;
}

export function DeliveryItemsStep({
  description,
  onDescriptionChange,
  items,
  onItemsChange,
  images,
  onImagesChange,
}: DeliveryItemsStepProps) {
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Items & details</h2>
        <p className="text-muted-foreground text-sm">
          List what needs to be collected and delivered. Weights help couriers quote accurately.
        </p>
      </div>

      <div>
        <Label htmlFor="delivery-desc">Description (optional)</Label>
        <Textarea
          id="delivery-desc"
          rows={3}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Access notes, fragile items, timing…"
          className="mt-2"
        />
      </div>

      <div className="space-y-3">
        <Label>Items to move</Label>
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-5">
              <Input
                placeholder="Item name"
                value={item.name}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], name: e.target.value };
                  onItemsChange(next);
                }}
              />
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                min={1}
                placeholder="Qty"
                value={item.qty}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], qty: Number(e.target.value) || 1 };
                  onItemsChange(next);
                }}
              />
            </div>
            <div className="col-span-3">
              <Input
                type="number"
                min={0}
                step="0.1"
                placeholder="Weight kg"
                value={item.weightKg ?? ''}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = {
                    ...next[idx],
                    weightKg: e.target.value === '' ? undefined : Number(e.target.value),
                  };
                  onItemsChange(next);
                }}
              />
            </div>
            <div className="col-span-2 flex justify-end">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={items.length <= 1}
                onClick={() => onItemsChange(items.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onItemsChange([...items, { name: '', qty: 1 }])}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add item
        </Button>
      </div>

      <div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={async (e) => {
            const input = e.target;
            const files = input.files;
            if (!files?.length) return;
            try {
              const urls: string[] = [];
              for (const file of Array.from(files)) {
                if (!file.type.startsWith('image/')) continue;
                urls.push(await uploadJobImage(file));
              }
              if (urls.length) {
                onImagesChange([...images, ...urls]);
                toast({ title: 'Photos added', description: `${urls.length} file(s) uploaded.` });
              }
            } catch (err) {
              toast({
                title: 'Upload failed',
                description: err instanceof Error ? err.message : 'Could not upload images.',
                variant: 'destructive',
              });
            } finally {
              input.value = '';
            }
          }}
        />
        <Label className="text-sm font-medium">Photos (optional)</Label>
        <p className="text-sm text-muted-foreground mb-2">Help the courier see what they are collecting.</p>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(ev) => ev.key === 'Enter' && imageInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => imageInputRef.current?.click()}
        >
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Click to upload images</p>
        </div>
        {images.length > 0 && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {images.map((img, idx) => (
              <div key={`${img}-${idx}`} className="relative">
                <div className="h-20 w-20 rounded-lg bg-muted overflow-hidden">
                  <img src={resolveUploadUrl(img)} alt="" className="h-full w-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => onImagesChange(images.filter((_, i) => i !== idx))}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
