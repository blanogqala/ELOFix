export type AnalyticsFilterState = {
  search: string;
  city: string;
  province: string;
  role: string;
  category: string;
  from: string;
  to: string;
  preset: string;
};

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilterState = {
  search: '',
  city: 'all',
  province: 'all',
  role: 'all',
  category: 'all',
  from: '',
  to: '',
  preset: '30d',
};

export function toAnalyticsApiParams(filters: AnalyticsFilterState) {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.search.trim()) params.search = filters.search.trim();
  if (filters.city !== 'all') params.city = filters.city;
  if (filters.province !== 'all') params.province = filters.province;
  if (filters.role !== 'all') params.role = filters.role;
  if (filters.category !== 'all') params.category = filters.category;
  return params;
}

export function filtersFromSearchParams(sp: URLSearchParams): AnalyticsFilterState {
  return {
    search: sp.get('search') || '',
    city: sp.get('city') || 'all',
    province: sp.get('province') || 'all',
    role: sp.get('role') || 'all',
    category: sp.get('category') || 'all',
    from: sp.get('from') || '',
    to: sp.get('to') || '',
    preset: sp.get('preset') || '30d',
  };
}

export function applyPresetDates(preset: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30;
  from.setDate(from.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

export function filtersToSearchParams(filters: AnalyticsFilterState): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.search.trim()) sp.set('search', filters.search.trim());
  if (filters.city !== 'all') sp.set('city', filters.city);
  if (filters.province !== 'all') sp.set('province', filters.province);
  if (filters.role !== 'all') sp.set('role', filters.role);
  if (filters.category !== 'all') sp.set('category', filters.category);
  if (filters.from) sp.set('from', filters.from);
  if (filters.to) sp.set('to', filters.to);
  if (filters.preset && filters.preset !== 'custom') sp.set('preset', filters.preset);
  return sp;
}

export function activeFilterCount(filters: AnalyticsFilterState): number {
  let n = 0;
  if (filters.search.trim()) n += 1;
  if (filters.city !== 'all') n += 1;
  if (filters.province !== 'all') n += 1;
  if (filters.role !== 'all') n += 1;
  if (filters.category !== 'all') n += 1;
  if (filters.preset === 'custom' && (filters.from || filters.to)) n += 1;
  return n;
}
