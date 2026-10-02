import type { MarketplaceMaterialCategory, SupplierBranchProfile } from '@/types';
import apiClient from '@/api/client';

export type MarketplaceCategoryInput = {
  name?: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

function errorMessage(error: unknown, fallback: string) {
  const ax = error as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message || ax.message || fallback;
}

export async function getMarketplaceMaterialCategories(): Promise<MarketplaceMaterialCategory[]> {
  const { data } = await apiClient.get<{ success: boolean; categories: MarketplaceMaterialCategory[] }>(
    '/marketplace-material-categories'
  );
  return Array.isArray(data?.categories) ? data.categories : [];
}

export async function getAdminMarketplaceMaterialCategories(): Promise<MarketplaceMaterialCategory[]> {
  const { data } = await apiClient.get<{ success: boolean; categories: MarketplaceMaterialCategory[] }>(
    '/admin/marketplace-material-categories'
  );
  return Array.isArray(data?.categories) ? data.categories : [];
}

export async function createAdminMarketplaceMaterialCategory(
  body: MarketplaceCategoryInput
): Promise<MarketplaceMaterialCategory> {
  try {
    const { data } = await apiClient.post<{ success: boolean; category: MarketplaceMaterialCategory }>(
      '/admin/marketplace-material-categories',
      body
    );
    if (!data?.category) throw new Error('Failed to create category');
    return data.category;
  } catch (error) {
    throw new Error(errorMessage(error, 'Failed to create category'));
  }
}

export async function updateAdminMarketplaceMaterialCategory(
  id: string,
  body: MarketplaceCategoryInput
): Promise<MarketplaceMaterialCategory> {
  try {
    const { data } = await apiClient.patch<{ success: boolean; category: MarketplaceMaterialCategory }>(
      `/admin/marketplace-material-categories/${encodeURIComponent(id)}`,
      body
    );
    if (!data?.category) throw new Error('Failed to update category');
    return data.category;
  } catch (error) {
    throw new Error(errorMessage(error, 'Failed to update category'));
  }
}

export async function assignAdminBranchMarketplaceCategories(
  supplierId: string,
  branchId: string,
  categoryIds: string[]
): Promise<SupplierBranchProfile> {
  try {
    const { data } = await apiClient.patch<{ success: boolean; branch: SupplierBranchProfile }>(
      `/admin/suppliers/${encodeURIComponent(supplierId)}/branches/${encodeURIComponent(branchId)}/marketplace-categories`,
      { categoryIds }
    );
    if (!data?.branch) throw new Error('Failed to update branch categories');
    return data.branch;
  } catch (error) {
    throw new Error(errorMessage(error, 'Failed to update branch categories'));
  }
}
