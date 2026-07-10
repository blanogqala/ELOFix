import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { AdminAnalyticsFilterOptions } from '@/lib/api/admin';
import { Loader2, RefreshCw, Search, X } from 'lucide-react';
import {
  type AnalyticsFilterState,
  DEFAULT_ANALYTICS_FILTERS,
  activeFilterCount,
  applyPresetDates,
} from './analyticsFilters';

const SEARCH_DEBOUNCE_MS = 300;

type AnalyticsFilterBarProps = {
  filters: AnalyticsFilterState;
  onChange: (filters: AnalyticsFilterState) => void;
  filterOptions?: AdminAnalyticsFilterOptions | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
};

export function AnalyticsFilterBar({
  filters,
  onChange,
  filterOptions,
  onRefresh,
  isRefreshing,
}: AnalyticsFilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);

  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChange({ ...filters, search: searchInput });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, filters, onChange]);

  const handlePreset = (preset: string) => {
    if (preset === 'custom') {
      onChange({ ...filters, preset });
      return;
    }
    const { from, to } = applyPresetDates(preset);
    onChange({ ...filters, preset, from, to });
  };

  const clearAll = () => {
    const { from, to } = applyPresetDates('30d');
    onChange({ ...DEFAULT_ANALYTICS_FILTERS, from, to });
    setSearchInput('');
  };

  const activeCount = activeFilterCount(filters);

  return (
    <div className="sticky top-0 z-10 -mx-1 space-y-3 rounded-xl border border-border/60 bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search jobs, users, emails…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.preset} onValueChange={handlePreset}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {filters.preset === 'custom' && (
            <>
              <Input
                type="date"
                className="w-[140px]"
                value={filters.from}
                onChange={(e) => onChange({ ...filters, from: e.target.value, preset: 'custom' })}
              />
              <Input
                type="date"
                className="w-[140px]"
                value={filters.to}
                onChange={(e) => onChange({ ...filters, to: e.target.value, preset: 'custom' })}
              />
            </>
          )}
          <Select value={filters.city} onValueChange={(v) => onChange({ ...filters, city: v })}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {(filterOptions?.cities ?? []).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.province} onValueChange={(v) => onChange({ ...filters, province: v })}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Province" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All provinces</SelectItem>
              {(filterOptions?.provinces ?? []).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.role} onValueChange={(v) => onChange({ ...filters, role: v })}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="CUSTOMER">Customers</SelectItem>
              <SelectItem value="PROVIDER">Providers</SelectItem>
              <SelectItem value="SUPPLIER">Suppliers</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.category} onValueChange={(v) => onChange({ ...filters, category: v })}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(filterOptions?.categories ?? []).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          {activeCount > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.search.trim() && <Badge variant="secondary">Search: {filters.search}</Badge>}
          {filters.city !== 'all' && <Badge variant="secondary">City: {filters.city}</Badge>}
          {filters.province !== 'all' && <Badge variant="secondary">Province: {filters.province}</Badge>}
          {filters.role !== 'all' && <Badge variant="secondary">Role: {filters.role}</Badge>}
          {filters.category !== 'all' && <Badge variant="secondary">Category: {filters.category}</Badge>}
        </div>
      )}
    </div>
  );
}
