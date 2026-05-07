import { Special, DeliveryProvider, Provider } from '@/types';
import apiClient from '@/api/client';

interface SpecialsResponse {
  success: boolean;
  specials: Special[];
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

function providerToDeliveryCard(p: Provider): DeliveryProvider {
  const labor = p.laborPricing && typeof p.laborPricing === 'object' ? p.laborPricing : {};
  const deliveryEntry = labor['delivery'] as { rate?: number } | undefined;
  const firstRate = Object.values(labor).find(
    (v): v is { rate?: number } => v != null && typeof v === 'object' && 'rate' in v
  )?.rate;
  const baseRate =
    typeof deliveryEntry?.rate === 'number'
      ? deliveryEntry.rate
      : typeof firstRate === 'number'
        ? firstRate
        : 0;

  return {
    id: p.id,
    name: (p.businessName && p.businessName.trim()) || p.name,
    logo: p.profileImage,
    baseRate,
    perKmRate: 0,
    estimatedTime: p.responseTime || '—',
    vehicleType: undefined,
    rating: p.rating,
  };
}

/** Couriers: approved providers with skill/category `delivery` (see seed categories). */
export async function getDeliveryProviders(options?: {
  city?: string;
  lat?: number;
  lng?: number;
}): Promise<DeliveryProvider[]> {
  const { data } = await apiClient.get<{ success: boolean; providers: Provider[] }>(
    '/providers',
    {
      params: {
        category: 'delivery',
        city: options?.city?.trim() || undefined,
      },
    }
  );
  const providers = Array.isArray(data?.providers) ? data.providers : [];
  const eligible = providers.filter(
    (p) =>
      p.approved &&
      p.profileCompleted !== false &&
      !p.blocked &&
      !p.deletedAt &&
      p.settings?.availability !== false
  );
  return eligible.map(providerToDeliveryCard);
}
