import apiClient from '@/api/client';
import { Category } from '@/types';

interface CategoriesResponse {
  success: boolean;
  categories: Category[];
}

interface CategoryResponse {
  success: boolean;
  category: Category;
}

export type CategoryInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export async function getCategories(includeInactive = false): Promise<Category[]> {
  const { data } = await apiClient.get<CategoriesResponse>('/categories', {
    params: includeInactive ? { includeInactive: true } : undefined,
  });
  return Array.isArray(data?.categories) ? data.categories : [];
}

export async function getCategoryById(id: string): Promise<Category | null> {
  try {
    const { data } = await apiClient.get<CategoryResponse>(`/categories/${id}`);
    return data?.category ?? null;
  } catch {
    return null;
  }
}

export async function createCategory(payload: CategoryInput): Promise<Category> {
  const { data } = await apiClient.post<CategoryResponse>('/categories', payload);
  if (!data?.category) throw new Error('Failed to create category');
  return data.category;
}

export async function updateCategory(id: string, payload: Partial<CategoryInput>): Promise<Category> {
  const { data } = await apiClient.patch<CategoryResponse>(`/categories/${id}`, payload);
  if (!data?.category) throw new Error('Failed to update category');
  return data.category;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/categories/${id}`);
}

export async function getServiceAreas(): Promise<string[]> {
  const { data } = await apiClient.get<{ success: boolean; serviceAreas: string[] }>(
    '/categories/service-areas'
  );
  return Array.isArray(data?.serviceAreas) ? data.serviceAreas : [];
}

export async function suggestCategory(name: string): Promise<void> {
  await apiClient.post('/categories/suggest', { name });
}

