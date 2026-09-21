import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCategoryLabel, type CatalogProductFilters } from './catalogUtils';

const ALL = 'all';

export function CatalogToolbar({
  filters,
  onChange,
  categoryKeys,
  searchPlaceholder = 'Search…',
  hideCategory,
}: {
  filters: CatalogProductFilters;
  onChange: (next: CatalogProductFilters) => void;
  categoryKeys?: string[];
  searchPlaceholder?: string;
  hideCategory?: boolean;
}) {
  const patch = (partial: Partial<CatalogProductFilters>) => onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-0 flex-1 sm:min-w-[12rem]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search ?? ''}
          onChange={(e) => patch({ search: e.target.value })}
          placeholder={searchPlaceholder}
          className="h-11 pl-9"
          aria-label="Search catalogue"
        />
      </div>
      <div className="flex min-w-0 flex-wrap gap-2 overflow-x-auto pb-0.5">
        {!hideCategory && categoryKeys && categoryKeys.length > 0 && (
          <Select value={filters.category ?? ALL} onValueChange={(v) => patch({ category: v })}>
            <SelectTrigger className="h-11 w-[9.5rem] sm:w-[11rem]" aria-label="Filter by category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categoryKeys.map((c) => (
                <SelectItem key={c} value={c}>
                  {formatCategoryLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={filters.availability ?? ALL}
          onValueChange={(v) => patch({ availability: v as CatalogProductFilters['availability'] })}
        >
          <SelectTrigger className="h-11 w-[8.5rem]" aria-label="Filter by availability">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stock</SelectItem>
            <SelectItem value="in_stock">In stock</SelectItem>
            <SelectItem value="out_of_stock">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.qualityTier ?? ALL}
          onValueChange={(v) => patch({ qualityTier: v as CatalogProductFilters['qualityTier'] })}
        >
          <SelectTrigger className="h-11 w-[8.5rem]" aria-label="Filter by quality">
            <SelectValue placeholder="Quality" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All quality</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.special ?? ALL}
          onValueChange={(v) => patch({ special: v as CatalogProductFilters['special'] })}
        >
          <SelectTrigger className="h-11 w-[8.5rem]" aria-label="Filter specials">
            <SelectValue placeholder="Specials" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All items</SelectItem>
            <SelectItem value="special">Specials</SelectItem>
            <SelectItem value="regular">Regular</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.sort ?? 'name_asc'}
          onValueChange={(v) => patch({ sort: v as CatalogProductFilters['sort'] })}
        >
          <SelectTrigger className="h-11 w-[9.5rem]" aria-label="Sort catalogue">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Name A–Z</SelectItem>
            <SelectItem value="name_desc">Name Z–A</SelectItem>
            <SelectItem value="price_asc">Price low–high</SelectItem>
            <SelectItem value="price_desc">Price high–low</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
