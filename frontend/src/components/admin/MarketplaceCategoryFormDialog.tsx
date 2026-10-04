import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarketplaceCategoryIconPicker } from '@/components/marketplace/MarketplaceCategoryIconPicker';
import { uploadAdminMarketplaceCategoryImage } from '@/lib/api/marketplaceMaterialCategories';
import { compressImageForUpload } from '@/lib/imageCompression';
import {
  buildMarketplaceCategorySaveBody,
  type MarketplaceCategorySaveBody,
} from '@/lib/marketplaceCategoryForm';
import { resolveUploadUrl } from '@/lib/uploadUrl';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 8 * 1024 * 1024;

export type MarketplaceCategoryFormInitial = {
  name: string;
  icon?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
};

function isAllowedImage(file: File) {
  if (ALLOWED_TYPES.has(file.type)) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

export function MarketplaceCategoryFormDialog({
  open,
  mode,
  initial,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: MarketplaceCategoryFormInitial | null;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: MarketplaceCategorySaveBody) => void;
}) {
  const nameId = useId();
  const imageId = useId();
  const iconId = useId();
  const activeId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [storedImageUrl, setStoredImageUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seed, setSeed] = useState('new');

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setIcon(initial?.icon ?? '');
    setIsActive(initial?.isActive !== false);
    setStoredImageUrl(initial?.imageUrl ?? null);
    setFile(null);
    setRemoved(false);
    setImageError(null);
    setPreparing(false);
    setUploading(false);
    setSeed(`${mode}:${initial?.name ?? ''}:${initial?.icon ?? ''}:${initial?.imageUrl ?? ''}`);
    setPreviewUrl(initial?.imageUrl ? resolveUploadUrl(initial.imageUrl) || null : null);
    if (fileRef.current) fileRef.current.value = '';
  }, [open, initial, mode]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const busy = Boolean(pending) || uploading || preparing;
  const showPreview = Boolean(previewUrl) && !removed;

  const chooseFile = async (next: File | null) => {
    setImageError(null);
    if (!next) return;
    if (!isAllowedImage(next)) {
      setImageError('Use a PNG, JPG, WebP, or GIF image.');
      return;
    }
    setPreparing(true);
    try {
      let prepared = next;
      try {
        prepared = await compressImageForUpload(next);
      } catch {
        prepared = next;
      }
      if (prepared.size > MAX_BYTES) {
        setImageError('Image must be 8 MB or smaller.');
        return;
      }
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
      setFile(prepared);
      setRemoved(false);
      setPreviewUrl(URL.createObjectURL(prepared));
    } finally {
      setPreparing(false);
    }
  };

  const clearImage = () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setRemoved(true);
    setImageError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (!name.trim() || busy) return;
    setImageError(null);
    let imageUrl = removed ? null : storedImageUrl;
    if (file) {
      setUploading(true);
      try {
        const uploaded = await uploadAdminMarketplaceCategoryImage(file);
        if (!uploaded.url || uploaded.url.startsWith('blob:') || uploaded.url.startsWith('data:')) {
          throw new Error('Upload did not return a stored image URL.');
        }
        imageUrl = uploaded.url;
      } catch (error) {
        setImageError(error instanceof Error ? error.message : 'Could not upload the image.');
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    onSubmit(
      buildMarketplaceCategorySaveBody({
        name,
        icon,
        imageUrl,
        isActive,
      })
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pr-12 pt-6">
          <DialogTitle>{mode === 'edit' ? 'Edit material category' : 'New material category'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Update how this category appears in the marketplace.'
              : 'Add a marketplace classification customers and providers can browse.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5 px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor={nameId}>
              Category name <span className="text-destructive">*</span>
            </Label>
            <Input
              id={nameId}
              value={name}
              placeholder="Roofing"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-4">
            <p className="text-sm font-medium">Category visual</p>
            <MarketplaceCategoryIconPicker key={seed} id={iconId} value={icon} onChange={setIcon} />
            <div className="space-y-2">
              <Label htmlFor={imageId}>Category image (optional)</Label>
              <input
                id={imageId}
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  void chooseFile(next);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {showPreview ? 'Replace image' : 'Upload image'}
                </Button>
                {showPreview ? (
                  <Button type="button" variant="ghost" onClick={clearImage} disabled={busy}>
                    Remove image
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG, WebP, or GIF. Up to 8 MB.</p>
              {file?.name ? <p className="truncate text-xs text-muted-foreground">{file.name}</p> : null}
              {showPreview ? (
                <div className="aspect-square w-24 overflow-hidden rounded-lg border border-border bg-muted">
                  <img src={previewUrl ?? ''} alt="" className="h-full w-full object-cover" />
                </div>
              ) : null}
              {imageError ? (
                <p role="alert" className="text-sm text-destructive">
                  {imageError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <Label htmlFor={activeId}>Active</Label>
            <Switch id={activeId} checked={isActive} onCheckedChange={setIsActive} disabled={busy} />
          </div>
        </DialogBody>
        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" className="btn-accent" disabled={busy || !name.trim()} onClick={() => void submit()}>
            {uploading
              ? 'Uploading...'
              : pending
                ? mode === 'edit'
                  ? 'Saving...'
                  : 'Creating...'
                : mode === 'edit'
                  ? 'Save changes'
                  : 'Create category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
