import type { MaterialLine, UserMaterialSuggestion } from '@/types';

/** Normalize legacy single-item suggestions into a grouped item list. */
export function getUserSuggestionItems(s: UserMaterialSuggestion): MaterialLine[] {
  if (Array.isArray(s.suggestedItems) && s.suggestedItems.length > 0) {
    return s.suggestedItems;
  }
  if (s.suggested) return [s.suggested];
  return [];
}

export function getUserSuggestionSubtotal(s: UserMaterialSuggestion): number {
  return getUserSuggestionItems(s).reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
}

export function getUserSuggestionStoreInfo(s: UserMaterialSuggestion): {
  storeName: string;
  storeId: string;
} {
  const items = getUserSuggestionItems(s);
  const first = items[0];
  return {
    storeName: first?.supplierName || 'Store',
    storeId: first?.branchId ?? first?.supplierId ?? '',
  };
}

export function normalizeUserMaterialSuggestion(raw: UserMaterialSuggestion): UserMaterialSuggestion {
  const suggestedItems = getUserSuggestionItems(raw);
  const first = suggestedItems[0];
  return {
    ...raw,
    suggestedItems,
    productId: raw.productId || first?.productId || '',
  };
}
