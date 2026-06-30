import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { cn } from '@/lib/utils';

export type MediaLightboxItem = {
  url: string;
  kind: 'image' | 'video';
};

interface MediaLightboxProps {
  items: MediaLightboxItem[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MediaLightbox({ items, initialIndex = 0, open, onOpenChange }: MediaLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  if (items.length === 0) return null;

  const current = items[index];
  const hasMultiple = items.length > 1;

  const goPrev = () => setIndex((i) => (i - 1 + items.length) % items.length);
  const goNext = () => setIndex((i) => (i + 1) % items.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-0 bg-black/95 p-0 text-white shadow-2xl [&>button]:hidden">
        <div className="relative flex min-h-[50vh] max-h-[85vh] flex-col">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>

          <div className="flex flex-1 items-center justify-center p-4 pt-12">
            {current.kind === 'video' ? (
              <video
                key={current.url}
                src={resolveUploadUrl(current.url)}
                className="max-h-[70vh] max-w-full rounded-lg"
                controls
                autoPlay
              />
            ) : (
              <img
                src={resolveUploadUrl(current.url)}
                alt=""
                className="max-h-[70vh] max-w-full rounded-lg object-contain"
              />
            )}
          </div>

          {hasMultiple && (
            <div className="flex items-center justify-center gap-3 border-t border-white/10 px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={goPrev}
                aria-label="Previous"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="text-sm tabular-nums text-white/80">
                {index + 1} / {items.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={goNext}
                aria-label="Next"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ReviewMediaGridProps {
  images?: string[];
  videos?: string[];
  className?: string;
}

export function ReviewMediaGrid({ images = [], videos = [], className }: ReviewMediaGridProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const items: MediaLightboxItem[] = [
    ...images.map((url) => ({ url, kind: 'image' as const })),
    ...videos.map((url) => ({ url, kind: 'video' as const })),
  ];

  if (items.length === 0) return null;

  const openAt = (idx: number) => {
    setLightboxIndex(idx);
    setLightboxOpen(true);
  };

  return (
    <>
      <div className={cn('mt-3 flex flex-wrap gap-2', className)}>
        {items.map((item, idx) => (
          <button
            key={`${item.kind}-${item.url}`}
            type="button"
            onClick={() => openAt(idx)}
            className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted transition hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={item.kind === 'video' ? 'Play video' : 'View image'}
          >
            {item.kind === 'video' ? (
              <video
                src={resolveUploadUrl(item.url)}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
            ) : (
              <img
                src={resolveUploadUrl(item.url)}
                alt=""
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            )}
            {item.kind === 'video' && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs font-medium text-white">
                Video
              </span>
            )}
          </button>
        ))}
      </div>
      <MediaLightbox
        items={items}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </>
  );
}
