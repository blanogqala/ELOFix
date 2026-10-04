import { normalizeMarketplaceIconKey } from '@/components/marketplace/marketplaceCategoryIcons';

export type MarketplaceCategorySaveBody = {
  name: string;
  icon: string | null;
  imageUrl: string | null;
  isActive: boolean;
};

/** Admin category create/update body. Description and sort order stay off the payload. */
export function buildMarketplaceCategorySaveBody(input: {
  name: string;
  icon: string;
  imageUrl: string | null;
  isActive: boolean;
}): MarketplaceCategorySaveBody {
  return {
    name: input.name.trim(),
    icon: normalizeMarketplaceIconKey(input.icon),
    imageUrl: input.imageUrl,
    isActive: input.isActive,
  };
}
