import { Supplier, Product } from '@/types';
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

export async function getProductsByCategory(category: string): Promise<Array<Product & { supplierId: string; supplierName: string }>> {
  const { data } = await apiClient.get<ProductsResponse>('/suppliers/products', {
    params: category ? { category } : undefined,
  });
  return Array.isArray(data?.products) ? data.products : [];
}

export async function updateProductPrice(
  supplierId: string, 
  productId: string, 
  newPrice: number
): Promise<Supplier> {
  const { data } = await apiClient.patch<SupplierResponse>(
    `/suppliers/${supplierId}/products/${productId}/price`,
    { newPrice }
  );
  if (!data?.supplier) throw new Error('Failed to update product price');
  return data.supplier;
}

export async function addProduct(supplierId: string, product: Product): Promise<Supplier> {
  const { data } = await apiClient.post<SupplierResponse>(`/suppliers/${supplierId}/products`, product);
  if (!data?.supplier) throw new Error('Failed to add supplier product');
  return data.supplier;
}

export async function createSupplier(name: string): Promise<Supplier> {
  const { data } = await apiClient.post<SupplierResponse>('/suppliers', { name });
  if (!data?.supplier) throw new Error('Failed to create supplier');
  return data.supplier;
}
