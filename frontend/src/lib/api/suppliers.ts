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
  products: Array<Product & { supplierId: string; supplierName: string }>;
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
): Promise<Array<Product & { supplierId: string; supplierName: string }>> {
  const { data } = await apiClient.get<ProductsResponse>('/suppliers/products', {
    params: category ? { category } : undefined,
  });
  return Array.isArray(data?.products) ? data.products : [];
}

/** Admin provisions a supplier login + storefront (JWT required, ADMIN role). */
export async function provisionSupplier(payload: {
  email: string;
  password: string;
  name?: string;
  businessName?: string;
  phone?: string;
  address?: string;
}): Promise<Supplier> {
  const { data } = await apiClient.post<SupplierResponse>('/suppliers', payload);
  if (!data?.supplier) throw new Error('Failed to provision supplier');
  return data.supplier;
}
