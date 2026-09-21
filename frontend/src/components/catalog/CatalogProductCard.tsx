import type { ReactNode } from 'react';
import { Package, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { formatCategoryLabel, type CatalogProductLike } from './catalogUtils';

function qualityClass(tier: string | undefined) {
  switch (tier) {
    case 'high':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100';
    case 'medium':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function CatalogProductCard({
  product,
  actions,
  details,
  selected,
}: {
  product: CatalogProductLike;
  actions?: ReactNode;
  details?: ReactNode;
  selected?: boolean;
}) {
  const src = resolveUploadUrl(product.image);
  return (
    <article
      className={cn(
        'flex h-full min-h-[260px] w-full flex-col overflow-hidden rounded-xl border-2 bg-card shadow-sm ring-1 ring-border transition-[box-shadow,border-color]',
        selected ? 'border-primary ring-primary/25 shadow-md' : 'border-primary/50 hover:border-primary'
      )}
    >
      <div className="relative aspect-[4/3] w-full shrink-0 bg-muted">
        {src ? (
          <img src={src} alt={product.name} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center bg-primary/5">
            <Package className="h-8 w-8 text-primary/40" aria-hidden />
          </div>
        )}
        {product.special && (
          <Badge className="absolute right-2 top-2 gap-0.5 bg-accent px-2 text-[10px] text-accent-foreground shadow-sm">
            <Sparkles className="size-3" /> Special
          </Badge>
        )}
        {product.inStock === false && (
          <span className="absolute left-2 top-2 rounded-md bg-background/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Out of stock
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="min-h-0 flex-1">
          <p className="text-xs text-muted-foreground">{formatCategoryLabel(product.category)}</p>
          <p className="text-sm font-medium leading-snug line-clamp-2">{product.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {product.qualityTier ? (
              <Badge variant="outline" className={cn('text-[10px] font-normal capitalize', qualityClass(product.qualityTier))}>
                {product.qualityTier}
              </Badge>
            ) : null}
          </div>
          {product.description ? (
            <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{product.description}</p>
          ) : null}
          {details}
        </div>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-border pt-3">
          <div className="min-w-0">
            <p className="text-sm font-bold tabular-nums leading-none">{formatCurrency(product.price)}</p>
            {product.unit ? <p className="text-[10px] text-muted-foreground">per {product.unit}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{actions}</div> : null}
        </div>
      </div>
    </article>
  );
}

export function CatalogProductGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}
