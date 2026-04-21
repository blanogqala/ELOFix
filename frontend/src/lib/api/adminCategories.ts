import apiClient from '@/api/client';

export interface AdminCategorySuggestion {
  id: string;
  name: string;
  userId: string;
  providerId: string | null;
  status: string;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: string };
  provider?: { id: string; businessName: string | null };
}

export async function getAdminCategorySuggestions(
  status?: string
): Promise<{ success: boolean; suggestions: AdminCategorySuggestion[] }> {
  const { data } = await apiClient.get('/admin/category-suggestions', {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function approveAdminCategorySuggestion(
  id: string
): Promise<{ success: boolean; suggestionId: string; categoryId: string }> {
  const { data } = await apiClient.patch(`/admin/category-suggestions/${id}/approve`);
  return data;
}
