import dynamicIconImports from 'lucide-react/dynamicIconImports';
import { MARKETPLACE_ICON_OPTIONS, normalizeMarketplaceIconKey } from './marketplaceCategoryIcons';

export type MarketplaceIconChoice = {
  value: string;
  label: string;
};

const SUGGESTIONS: MarketplaceIconChoice[] = MARKETPLACE_ICON_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

const SUGGESTION_VALUES = new Set(SUGGESTIONS.map((option) => option.value));

const LUCIDE_NAMES = Object.keys(dynamicIconImports).filter(
  (name) => /^[a-z0-9_-]{1,40}$/.test(name) && !SUGGESTION_VALUES.has(name)
);

export function isKnownMarketplaceIcon(icon?: string | null): boolean {
  const key = normalizeMarketplaceIconKey(icon);
  if (!key) return false;
  if (SUGGESTION_VALUES.has(key)) return true;
  return Object.prototype.hasOwnProperty.call(dynamicIconImports, key);
}

export function marketplaceIconLabel(icon?: string | null): string {
  const key = normalizeMarketplaceIconKey(icon);
  if (!key) return '';
  return SUGGESTIONS.find((option) => option.value === key)?.label ?? key;
}

/** Suggestions when the query is empty; otherwise aliases plus bundled Lucide names. */
export function searchMarketplaceIcons(query: string, limit = 24): MarketplaceIconChoice[] {
  const q = query.trim().toLowerCase();
  if (!q) return SUGGESTIONS;

  const aliasHits = SUGGESTIONS.filter(
    (option) => option.value.includes(q) || option.label.toLowerCase().includes(q)
  );
  const lucideHits = LUCIDE_NAMES.filter((name) => name.includes(q))
    .sort((a, b) => {
      const rank = (name: string) => (name.startsWith(q) ? 0 : 1);
      return rank(a) - rank(b) || a.localeCompare(b);
    })
    .slice(0, limit)
    .map((name) => ({ value: name, label: name }));

  return [...aliasHits, ...lucideHits].slice(0, limit);
}
