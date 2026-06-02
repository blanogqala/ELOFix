import type { Category } from '@/types';
import { cn } from '@/lib/utils';

type CategoryListCardsProps = {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string) => void;
};

export function CategoryListCards({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryListCardsProps) {
  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No categories match your search.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.id)}
          className={cn(
            'w-full p-4 rounded-lg border-2 text-left transition-all flex items-center gap-3',
            selectedCategoryId === cat.id
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/30 card-elevated',
          )}
        >
          <span className="text-2xl">{cat.icon}</span>
          <div className="min-w-0">
            <p className="font-medium text-sm">{cat.name}</p>
            <p className="text-xs text-muted-foreground truncate">{cat.id}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
