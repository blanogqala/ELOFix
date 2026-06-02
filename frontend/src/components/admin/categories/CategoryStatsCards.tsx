import { Tags, Clock } from 'lucide-react';

type CategoryStatsCardsProps = {
  totalCategories: number;
  pendingSuggestions: number;
};

export function CategoryStatsCards({
  totalCategories,
  pendingSuggestions,
}: CategoryStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="card-elevated p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-12 sm:w-12">
            <Tags className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold sm:text-2xl">{totalCategories}</p>
            <p className="text-xs text-muted-foreground sm:text-sm">Total Categories</p>
          </div>
        </div>
      </div>

      <div className="card-elevated p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 sm:h-12 sm:w-12">
            <Clock className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="text-xl font-bold sm:text-2xl">{pendingSuggestions}</p>
            <p className="text-xs text-muted-foreground sm:text-sm">Pending Suggestions</p>
          </div>
        </div>
      </div>
    </div>
  );
}
