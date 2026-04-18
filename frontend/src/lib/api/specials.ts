import { Special, DeliveryProvider } from '@/types';
import apiClient from '@/api/client';

interface SpecialsResponse {
  success: boolean;
  specials: Special[];
}

interface DeliveryProvidersResponse {
  success: boolean;
  deliveryProviders: DeliveryProvider[];
}

export async function getSpecials(): Promise<Special[]> {
  const { data } = await apiClient.get<SpecialsResponse>('/specials');
  return Array.isArray(data?.specials) ? data.specials : [];
}

export async function getSpecialsBySupplier(supplierId: string): Promise<Special[]> {
  const { data } = await apiClient.get<SpecialsResponse>('/specials', { params: { supplierId } });
  return Array.isArray(data?.specials) ? data.specials : [];
}

export async function getSpecialsByCategory(category: string): Promise<Special[]> {
  const { data } = await apiClient.get<SpecialsResponse>('/specials', { params: { category } });
  return Array.isArray(data?.specials) ? data.specials : [];
}

export async function getDeliveryProviders(): Promise<DeliveryProvider[]> {
  const { data } = await apiClient.get<DeliveryProvidersResponse>('/delivery-providers');
  return Array.isArray(data?.deliveryProviders) ? data.deliveryProviders : [];
}
