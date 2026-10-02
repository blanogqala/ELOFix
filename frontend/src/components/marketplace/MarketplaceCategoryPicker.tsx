import type { MarketplaceMaterialCategory } from '@/types';
import { cn } from '@/lib/utils';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { Loader2 } from 'lucide-react';
import { MarketplaceCategoryIcon } from './marketplaceCategoryIcons';

export function MarketplaceCategoryPicker({
  categories,
  selectedId,
  onSelect,
  loading,
  error,
}: {
  categories: MarketplaceMaterialCategory[];
  selectedId: string | null;
  onSelect: (category: MarketplaceMaterialCategory) => void;
  loading?: boolean;
  error?: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading material categories…
      </div>
    );
  }

  if (error) {
    return <p className="py-6 text-center text-sm text-destructive">{error}</p>;
  }

  if (categories.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No material categories are available yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {categories.map((category) => {
        const selected = selectedId === category.id;
        const image = category.imageUrl ? resolveUploadUrl(category.imageUrl) : '';
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(category)}
            className={cn(
              'flex min-h-[5.5rem] flex-col items-start gap-2 rounded-xl border bg-card p-3 text-left shadow-sm transition-all',
              'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'border-primary ring-1 ring-primary/30' : 'border-border'
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
              {image ? (
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <MarketplaceCategoryIcon icon={category.icon} className="h-4 w-4" />
              )}
            </span>
            <span className="text-sm font-medium leading-tight">{category.name}</span>
          </button>
        );
      })}
    </div>
  );
}
