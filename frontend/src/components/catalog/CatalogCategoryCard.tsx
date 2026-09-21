import type { ReactNode } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { formatCategoryLabel } from './catalogUtils';

export function CatalogCategoryCard({
  name,
  imageUrl,
  productCount,
  highlighted,
  unavailable,
  hidden,
  onSelect,
  actions,
}: {
  name: string;
  imageUrl?: string;
  productCount: number;
  highlighted?: boolean;
  unavailable?: boolean;
  hidden?: boolean;
  onSelect: () => void;
  actions?: ReactNode;
}) {
  const label = formatCategoryLabel(name);
  const src = resolveUploadUrl(imageUrl);
  return (
    <div
      className={cn(
        'group flex h-full w-full flex-col overflow-hidden rounded-xl border-2 bg-card text-left shadow-sm transition-all',
        highlighted
          ? 'border-accent shadow-md'
          : 'border-primary/40 hover:border-primary hover:shadow-md'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`${label}, ${productCount} product${productCount === 1 ? '' : 's'}`}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {src ? (
            <img
              src={src}
              alt={label}
              className="absolute inset-0 size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-primary/5">
              <Package className="h-10 w-10 text-primary/50" aria-hidden />
            </div>
          )}
          {hidden && (
            <span className="absolute left-2 top-2 rounded-md bg-background/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Hidden from storefront
            </span>
          )}
          {!hidden && unavailable && (
            <span className="absolute left-2 top-2 rounded-md bg-background/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Empty
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-3">
          <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2">{label}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {productCount} product{productCount === 1 ? '' : 's'}
          </p>
        </div>
      </button>
      {actions ? (
        <div className="flex items-center justify-end gap-1 border-t border-border p-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function CatalogCategoryGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  );
}
