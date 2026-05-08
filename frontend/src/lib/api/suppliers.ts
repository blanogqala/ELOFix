import type { Product, Supplier } from '@/types';
import apiClient from '@/api/client';

interface SuppliersResponse {
  success: boolean;
  suppliers: Supplier[];
}

interface SupplierResponse {
  success: boolean;
  supplier: Supplier | null;
}

interface ProductsResponse {
  success: boolean;
  products: Array<Product & { supplierId: string; supplierName: string; branchId?: string }>;
}

export async function getSuppliers(): Promise<Supplier[]> {
  const { data } = await apiClient.get<SuppliersResponse>('/suppliers');
  return Array.isArray(data?.suppliers) ? data.suppliers : [];
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const { data } = await apiClient.get<SupplierResponse>(`/suppliers/${id}`);
  return data?.supplier ?? null;
}

export async function getProductsByCategory(
  category: string
): Promise<
  Array<
    Product & {
      supplierId: string;
      supplierName: string;
      branchId?: string;
      branchLatitude?: number;
      branchLongitude?: number;
    }
  >
> {
  const { data } = await apiClient.get<ProductsResponse>('/suppliers/products', {
    params: category ? { category } : undefined,
  });
  return Array.isArray(data?.products) ? data.products : [];
}

