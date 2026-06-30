import apiClient from '@/api/client';
import { Provider, JobLocation } from '@/types';
import type { ProviderDocType } from '@/lib/providerDocuments';

interface ProvidersResponse {
  success: boolean;
  providers: Provider[];
}

interface ProviderResponse {
  success: boolean;
  provider: Provider;
}

export async function getProviders(): Promise<Provider[]> {
  const { data } = await apiClient.get<ProvidersResponse>('/providers');
  return Array.isArray(data?.providers) ? data.providers : [];
}

/** Admin-only: all providers including pending / incomplete */
export async function getAdminProviders(): Promise<Provider[]> {
  const { data } = await apiClient.get<ProvidersResponse>('/admin/providers');
  return Array.isArray(data?.providers) ? data.providers : [];
}

export async function getApprovedProviders(): Promise<Provider[]> {
  const providers = await getProviders();
  return providers.filter(
    (p) =>
      p.approved &&
      p.profileCompleted !== false &&
      !p.blocked &&
      !p.deletedAt &&
      p.settings?.availability !== false
  );
}

export async function getPendingProviders(): Promise<Provider[]> {
  const providers = await getAdminProviders();
  return providers.filter((p) => !p.approved && !p.blocked);
}

export async function getProviderById(id: string): Promise<Provider | null> {
  try {
    const { data } = await apiClient.get<ProviderResponse>(`/providers/${id}`);
    return data?.provider ?? null;
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) return null;
    throw error;
  }
}

export async function getProvidersByCategory(
  categoryId: string,
  location?: Partial<JobLocation>
): Promise<Provider[]> {
  const params: Record<string, string> = {};
  if (categoryId) params.category = categoryId;
  if (location?.metro?.trim()) params.metro = location.metro.trim();
  if (location?.city?.trim()) params.city = location.city.trim();
  if (location?.area?.trim()) params.area = location.area.trim();
  if (location?.suburb?.trim()) params.suburb = location.suburb.trim();

  const { data } = await apiClient.get<ProvidersResponse>('/providers', {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  const providers = Array.isArray(data?.providers) ? data.providers : [];
  return providers.filter(
    (p) =>
      p.approved &&
      p.profileCompleted !== false &&
      !p.blocked &&
      !p.deletedAt &&
      p.settings?.availability !== false
  );
}

export async function updateProvider(id: string, updates: Partial<Provider>): Promise<Provider> {
  const { data } = await apiClient.patch<ProviderResponse>(`/providers/${id}`, updates);
  if (!data?.provider) throw new Error('Failed to update provider');
  return data.provider;
}

export async function uploadProviderDocument(
  providerUserId: string,
  documentType: ProviderDocType,
  file: File
): Promise<Provider> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await apiClient.post<ProviderResponse>(
    `/providers/${providerUserId}/documents/${documentType}`,
    fd
  );
  if (!data?.provider) throw new Error('Failed to upload document');
  return data.provider;
}

export async function uploadProviderAvatar(providerUserId: string, file: File): Promise<Provider> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await apiClient.post<ProviderResponse>(`/providers/${providerUserId}/avatar`, fd);
  if (!data?.provider) throw new Error('Failed to upload avatar');
  return data.provider;
}

export async function uploadWorkPostImage(providerUserId: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await apiClient.post<{ success: boolean; url: string }>(
    `/providers/${providerUserId}/work-images`,
    fd
  );
  if (!data?.url) throw new Error('Failed to upload image');
  return data.url;
}

export async function submitProviderForReview(providerUserId: string): Promise<Provider> {
  return updateProvider(providerUserId, { submitForReview: true } as Partial<Provider>);
}

export async function approveProvider(userId: string): Promise<Provider> {
  const { data } = await apiClient.patch<ProviderResponse>(`/admin/providers/${userId}/approve`);
  if (!data?.provider) throw new Error('Failed to approve provider');
  return data.provider;
}

export async function rejectProvider(userId: string, reason: string): Promise<Provider> {
  const { data } = await apiClient.patch<ProviderResponse>(`/admin/providers/${userId}/reject`, {
    reason,
  });
  if (!data?.provider) throw new Error('Failed to reject provider');
  return data.provider;
}

export async function blockProvider(userId: string, reason: string): Promise<Provider> {
  const { data } = await apiClient.patch<ProviderResponse>(`/admin/providers/${userId}/block`, {
    reason,
  });
  if (!data?.provider) throw new Error('Failed to block provider');
  return data.provider;
}

export async function unblockProvider(userId: string): Promise<Provider> {
  const { data } = await apiClient.patch<ProviderResponse>(`/admin/providers/${userId}/unblock`);
  if (!data?.provider) throw new Error('Failed to unblock provider');
  return data.provider;
}

export async function deleteProvider(userId: string): Promise<Provider> {
  const { data } = await apiClient.patch<ProviderResponse>(`/admin/providers/${userId}/delete`);
  if (!data?.provider) throw new Error('Failed to delete provider');
  return data.provider;
}

export async function rejectProviderDocument(
  providerUserId: string,
  documentType: ProviderDocType,
  feedback: string
): Promise<Provider> {
  const { data } = await apiClient.patch<ProviderResponse>(
    `/admin/providers/${providerUserId}/documents/${documentType}/reject`,
    { feedback: feedback.trim() || undefined }
  );
  if (!data?.provider) throw new Error('Failed to reject document');
  return data.provider;
}

export async function approveProviderDocument(
  providerUserId: string,
  documentType: ProviderDocType
): Promise<Provider> {
  const { data } = await apiClient.patch<ProviderResponse>(
    `/admin/providers/${providerUserId}/documents/${documentType}/approve`
  );
  if (!data?.provider) throw new Error('Failed to approve document');
  return data.provider;
}

export async function updateProviderSkills(id: string, skills: string[]): Promise<Provider> {
  return updateProvider(id, { skills });
}

export async function updateProviderPricing(
  id: string,
  laborPricing: Provider['laborPricing']
): Promise<Provider> {
  return updateProvider(id, { laborPricing });
}

export async function updateProviderPortfolio(id: string, portfolioImages: string[]): Promise<Provider> {
  return updateProvider(id, { portfolioImages });
}

export function recommendProviders(
  category: string,
  providers: Provider[],
  measurements: Record<string, number>
): Provider[] {
  void measurements;
  const eligible = providers.filter(
    (provider) =>
      provider.approved &&
      provider.profileCompleted !== false &&
      !provider.blocked &&
      !provider.deletedAt &&
      provider.settings?.availability !== false &&
      provider.skills.includes(category)
  );

  return [...eligible].sort((a, b) => {
    const reviewsA = a.totalReviews ?? a.reviews?.length ?? 0;
    const reviewsB = b.totalReviews ?? b.reviews?.length ?? 0;
    const scoreA = a.rating * 25 + reviewsA * 2 + a.completedJobs * 0.5;
    const scoreB = b.rating * 25 + reviewsB * 2 + b.completedJobs * 0.5;
    return scoreB - scoreA;
  });
}
