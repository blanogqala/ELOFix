import type { Supplier } from '@/types';
import apiClient from '@/api/client';

export type StoreRow = Supplier & {
  displayName?: string;
  brandName?: string;
  branchName?: string;
  city?: string;
  supplierId?: string;
  branchId?: string;
  distanceKm?: number | null;
};

interface BranchesNearbyResponse {
  success: boolean;
  branches: StoreRow[];
}

interface StoresResponse {
  success: boolean;
  stores: StoreRow[];
}

interface StoreProductsResponse {
  success: boolean;
  products: Supplier['products'];
}

export async function getBranchesNearby(params?: {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  city?: string;
  metro?: string;
  area?: string;
  suburb?: string;
  q?: string;
}): Promise<StoreRow[]> {
  const { data } = await apiClient.get<BranchesNearbyResponse>('/branches/nearby', {
    params: {
      lat: params?.lat,
      lng: params?.lng,
      radiusKm: params?.radiusKm,
      city: params?.city?.trim() || undefined,
      metro: params?.metro?.trim() || undefined,
      area: params?.area?.trim() || undefined,
      suburb: params?.suburb?.trim() || undefined,
      q: params?.q?.trim() || undefined,
    },
  });
  return Array.isArray(data?.branches) ? data.branches : [];
}

export async function getStores(params?: {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  city?: string;
  metro?: string;
  area?: string;
  suburb?: string;
  q?: string;
}): Promise<StoreRow[]> {
  const { data } = await apiClient.get<StoresResponse>('/stores', {
    params: {
      lat: params?.lat,
      lng: params?.lng,
      radiusKm: params?.radiusKm,
      city: params?.city?.trim() || undefined,
      metro: params?.metro?.trim() || undefined,
      area: params?.area?.trim() || undefined,
      suburb: params?.suburb?.trim() || undefined,
      q: params?.q?.trim() || undefined,
    },
  });
  return Array.isArray(data?.stores) ? data.stores : [];
}

export async function getStoreProducts(storeId: string): Promise<Supplier['products']> {
  const { data } = await apiClient.get<StoreProductsResponse>(`/stores/${storeId}/products`);
  return Array.isArray(data?.products) ? data.products : [];
}
