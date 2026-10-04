import type { MarketplaceMaterialCategory } from '@/types';
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

export async function uploadAdminMarketplaceCategoryImage(
  file: File
): Promise<{ fileId: string; url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await apiClient.post<{ success: boolean; fileId: string; url: string }>(
      '/admin/marketplace-material-categories/upload-image',
      fd
    );
    if (!data?.url) throw new Error('Failed to upload category image');
    return { fileId: data.fileId, url: data.url };
  } catch (error) {
    throw new Error(errorMessage(error, 'Failed to upload category image'));
  }
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

export type SupplierMarketplaceAssignment = {
  supplierId: string;
  allCategories: boolean;
  categoryIds: string[];
  categories: MarketplaceMaterialCategory[];
};

export class CategoryInUseError extends Error {
  supplierCount: number;

  constructor(supplierCount: number, message: string) {
    super(message);
    this.name = 'CategoryInUseError';
    this.supplierCount = supplierCount;
  }
}

export async function assignAdminSupplierMarketplaceCategories(
  supplierId: string,
  body: { categoryIds: string[]; allCategories: boolean }
): Promise<SupplierMarketplaceAssignment> {
  try {
    const { data } = await apiClient.patch<{ success: boolean; assignment: SupplierMarketplaceAssignment }>(
      `/admin/suppliers/${encodeURIComponent(supplierId)}/marketplace-categories`,
      body
    );
    if (!data?.assignment) throw new Error('Failed to update supplier categories');
    return data.assignment;
  } catch (error) {
    throw new Error(errorMessage(error, 'Failed to update supplier categories'));
  }
}

export async function deleteAdminMarketplaceMaterialCategory(id: string, confirm = false): Promise<void> {
  try {
    await apiClient.delete(`/admin/marketplace-material-categories/${encodeURIComponent(id)}`, {
      params: { confirm: confirm ? 'true' : 'false' },
    });
  } catch (error) {
    const ax = error as {
      response?: { status?: number; data?: { message?: string; supplierCount?: number } };
      message?: string;
    };
    if (ax.response?.status === 409) {
      throw new CategoryInUseError(
        Number(ax.response.data?.supplierCount ?? 0),
        ax.response.data?.message || 'This category is assigned to suppliers.'
      );
    }
    throw new Error(errorMessage(error, 'Failed to delete category'));
  }
}
