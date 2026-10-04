import { useEffect, useState } from 'react';
import type { MarketplaceMaterialCategory } from '@/types';
import { cn } from '@/lib/utils';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { LayoutGrid, Loader2 } from 'lucide-react';
import { MarketplaceCategoryIcon } from './marketplaceCategoryIcons';
import {
  ALL_MATERIALS_DISCOVERY,
  type MarketplaceDiscoverySelection,
} from '@/lib/marketplace/allMaterialsDiscovery';

function CategoryMark({ image, icon }: { image: string; icon?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [image]);

  if (image && !failed) {
    return (
      <img src={image} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
    );
  }
  return <MarketplaceCategoryIcon icon={icon} className="h-4 w-4" />;
}

function cardClass(selected: boolean) {
  return cn(
    'flex min-h-[5.5rem] flex-col items-start gap-2 rounded-xl border bg-card p-3 text-left shadow-sm transition-all',
    'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    selected ? 'border-primary ring-1 ring-primary/30' : 'border-border'
  );
}

export function MarketplaceCategoryPicker({
  categories,
  selectedId,
  onSelect,
  loading,
  error,
}: {
  categories: MarketplaceMaterialCategory[];
  /** Category UUID, or the virtual All Materials scope. Not a database id when it is `all`. */
  selectedId: string | null;
  onSelect: (selection: MarketplaceDiscoverySelection) => void;
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

  const allSelected = selectedId === ALL_MATERIALS_DISCOVERY.categoryId;

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Material categories" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <button
          type="button"
          aria-pressed={allSelected}
          onClick={() => onSelect(ALL_MATERIALS_DISCOVERY)}
          className={cardClass(allSelected)}
        >
          <span className="flex aspect-square h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-medium leading-tight">{ALL_MATERIALS_DISCOVERY.name}</span>
        </button>
        {!error &&
          categories.map((category) => {
            const selected = selectedId === category.id;
            const image = category.imageUrl ? resolveUploadUrl(category.imageUrl) : '';
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect({ categoryId: category.id, name: category.name })}
                className={cardClass(selected)}
              >
                <span className="flex aspect-square h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
                  <CategoryMark image={image} icon={category.icon} />
                </span>
                <span className="text-sm font-medium leading-tight">{category.name}</span>
              </button>
            );
          })}
      </div>
      {error ? <p className="py-2 text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
