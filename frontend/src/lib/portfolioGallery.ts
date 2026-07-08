import type { WorkPost } from '@/types';

export type PortfolioGalleryItem = {
  url: string;
  kind: 'image';
  caption?: string;
  description?: string;
};

export function filterWorkPostsByCategory(workPosts: WorkPost[], categoryId?: string): WorkPost[] {
  if (!categoryId) return [];
  return workPosts.filter((post) => post.categoryId === categoryId);
}

export function buildPortfolioGalleryItems(
  workPosts: WorkPost[] = [],
  _portfolioImages: string[] = [],
  categoryId?: string
): PortfolioGalleryItem[] {
  const filtered = filterWorkPostsByCategory(workPosts, categoryId);
  const fromPosts = filtered.flatMap((post) =>
    (post.images || [])
      .filter(Boolean)
      .map((url) => ({
        url,
        kind: 'image' as const,
        caption: post.title,
        description: post.description,
      }))
  );
  if (fromPosts.length > 0) return fromPosts;
  return [];
}

export function hasPortfolioGalleryItems(
  workPosts: WorkPost[] = [],
  portfolioImages: string[] = [],
  categoryId?: string
): boolean {
  return buildPortfolioGalleryItems(workPosts, portfolioImages, categoryId).length > 0;
}
