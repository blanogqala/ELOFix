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

/** Customer-facing courier label: personal name, not company/business name. */
export function deliveryProviderDisplayName(p: Provider): string {
  const personal = String(p.name || '').trim();
  if (personal) return personal;
  const business = String(p.businessName || '').trim();
  return business || 'Provider';
}

function providerToDeliveryCard(p: Provider): DeliveryProvider {
  const rateFromSettings =
    p.settings?.deliveryRatePerKm != null && Number.isFinite(p.settings.deliveryRatePerKm)
      ? Number(p.settings.deliveryRatePerKm)
      : 0;
  const labor = p.laborPricing && typeof p.laborPricing === 'object' ? p.laborPricing : {};
  const deliveryEntry = labor['delivery'] as { rate?: number } | undefined;

  const firstRate =
    typeof deliveryEntry?.rate === 'number' && Number.isFinite(deliveryEntry.rate) ? deliveryEntry.rate : undefined;

  const baseRate = firstRate ?? 0;

  return {
    id: p.id,
    name: deliveryProviderDisplayName(p),
    logo: p.profileImage,
    baseRate,
    perKmRate: rateFromSettings,
    estimatedTime: p.responseTime || '—',
    vehicleType: p.vehicleType,
    numberPlate: p.numberPlate,
    rating: p.rating,
    phone: p.phone,
    email: p.email,
  };
}

/** Couriers: approved providers with delivery/moving skill (see admin categories). */
export async function getDeliveryProviders(options?: {
  category?: string;
  city?: string;
  lat?: number;
  lng?: number;
}): Promise<DeliveryProvider[]> {
  const category = options?.category?.trim() || 'delivery';
  const { data } = await apiClient.get<{ success: boolean; providers: Provider[] }>(
    '/providers',
    {
      params: {
        category,
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
