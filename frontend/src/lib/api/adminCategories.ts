import apiClient from '@/api/client';

export interface AdminCategorySuggestion {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  userId: string;
  providerId: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  approvedAt?: string | null;
  approvedCategoryId?: string | null;
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
  id: string,
  payload: {
    serviceName: string;
    description?: string;
    icon?: string;
    skills?: string[];
  }
): Promise<{ success: boolean; suggestionId: string; categoryId: string }> {
  const { data } = await apiClient.patch(`/admin/category-suggestions/${id}/approve`, payload);
  return data;
}

export async function rejectAdminCategorySuggestion(
  id: string
): Promise<{ success: boolean; suggestionId: string }> {
  const { data } = await apiClient.patch(`/admin/category-suggestions/${id}/reject`);
  return data;
}
