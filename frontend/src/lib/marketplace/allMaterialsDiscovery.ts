/**
 * Nearby `categoryId` for the virtual All Materials discovery option.
 * This is not a MarketplaceMaterialCategory id and is never stored.
 * Customer and provider discovery both send this exact value.
 */
export const ALL_MATERIALS_CATEGORY_SCOPE = 'all';

export type MarketplaceDiscoverySelection = {
  /** Category UUID, or ALL_MATERIALS_CATEGORY_SCOPE. */
  categoryId: string;
  name: string;
};

export const ALL_MATERIALS_DISCOVERY: MarketplaceDiscoverySelection = {
  categoryId: ALL_MATERIALS_CATEGORY_SCOPE,
  name: 'All Materials',
};

export function isAllMaterialsDiscovery(categoryId: string | null | undefined): boolean {
  return String(categoryId ?? '').trim() === ALL_MATERIALS_CATEGORY_SCOPE;
}

export function marketplaceBranchListHint(
  selection: MarketplaceDiscoverySelection,
  audience: 'customer' | 'provider'
): string {
  if (isAllMaterialsDiscovery(selection.categoryId)) {
    return audience === 'customer'
      ? 'Nearby branches of suppliers that cover every material category, nearest first when your location is known.'
      : 'Branches of suppliers that cover every material category, nearest to the job site first.';
  }
  return audience === 'customer'
    ? `Physical branches supplying ${selection.name}, nearest first when your location is known.`
    : `Branches supplying ${selection.name}, nearest to the job site first.`;
}

export function marketplaceBranchEmptyHint(
  selection: MarketplaceDiscoverySelection,
  audience: 'customer' | 'provider'
): string {
  if (isAllMaterialsDiscovery(selection.categoryId)) {
    return audience === 'customer'
      ? 'No nearby branches from suppliers that cover every material category for this address. Try another category or area.'
      : 'No nearby branches from suppliers that cover every material category for the job site.';
  }
  return audience === 'customer'
    ? `No nearby branches supply ${selection.name} for this address. Try another category or area.`
    : `No nearby branches supply ${selection.name} for the job site.`;
}
