import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatCategoryLabel } from './catalogUtils';
import { CatalogMediaImage } from './CatalogMediaImage';

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
        className="flex min-h-0 w-full flex-1 flex-col p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`${label}, ${productCount} product${productCount === 1 ? '' : 's'}`}
      >
        <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
          <CatalogMediaImage src={imageUrl} alt={label} className="absolute inset-0 h-full w-full" />
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
        </span>
        <span className="flex flex-1 flex-col gap-0.5 p-3">
          <span className="text-sm font-semibold leading-snug text-foreground line-clamp-2">{label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {productCount} product{productCount === 1 ? '' : 's'}
          </span>
        </span>
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
