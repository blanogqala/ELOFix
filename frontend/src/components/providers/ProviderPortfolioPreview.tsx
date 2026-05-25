import { Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Provider } from '@/types';
import { resolveUploadUrl } from '@/lib/uploadUrl';

function collectPreviewImages(provider: Provider, categoryId?: string): string[] {
  const posts = (provider.workPosts || []).filter(
    (p) => !categoryId || p.categoryId === categoryId
  );
  const fromPosts = posts.flatMap((p) => (p.images || []).slice(0, 1)).filter(Boolean);
  if (fromPosts.length > 0) return fromPosts.slice(0, 4);
  return (provider.portfolioImages || []).slice(0, 4);
}

interface ProviderPortfolioPreviewProps {
  provider: Provider;
  categoryId?: string;
  className?: string;
}

export function ProviderPortfolioPreview({
  provider,
  categoryId,
  className,
}: ProviderPortfolioPreviewProps) {
  const images = collectPreviewImages(provider, categoryId);
  if (images.length === 0) {
    return (
      <div
        className={cn(
          'flex h-14 items-center justify-center rounded-lg border border-dashed bg-muted/40 text-xs text-muted-foreground',
          className
        )}
      >
        <Image className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
        Portfolio coming soon
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-4 gap-1.5', className)}>
      {images.map((src, idx) => (
        <div key={`${src}-${idx}`} className="aspect-square overflow-hidden rounded-md bg-muted">
          <img
            src={resolveUploadUrl(src) || '/placeholder.svg'}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
