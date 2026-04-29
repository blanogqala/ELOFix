/**
 * Normalize job category slugs and product categories for comparison
 * (handles casing, hyphens vs underscores).
 */
export function normalizeCategoryKey(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, '');
}

export function categoryKeysMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  return normalizeCategoryKey(a) === normalizeCategoryKey(b);
}
