import apiClient from '@/api/client';
import type { MaterialLine } from '@/types';

export type MaterialRequestStatusApi = 'draft' | 'submitted' | 'paid';

export interface MaterialRequestDto {
  id: string;
  jobId: string;
  providerId: string;
  customerId: string;
  items: MaterialLine[];
  totalAmount: number;
  status: MaterialRequestStatusApi;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  success: boolean;
  materialRequests: MaterialRequestDto[];
}

interface CreateResponse {
  success: boolean;
  materialRequest: MaterialRequestDto;
}

/** GET /api/materials/job/:jobId */
export async function getMaterialRequestsForJob(jobId: string): Promise<MaterialRequestDto[]> {
  const { data } = await apiClient.get<ListResponse>(`/materials/job/${jobId}`);
  return data?.materialRequests ?? [];
}

/** POST /api/materials/create */
export async function createMaterialRequestDraft(payload: {
  jobId: string;
  items: MaterialLine[];
}): Promise<MaterialRequestDto> {
  const { data } = await apiClient.post<CreateResponse>('/materials/create', payload);
  if (!data?.materialRequest) throw new Error('Invalid create response');
  return data.materialRequest;
}

/** POST /api/materials/submit */
export async function submitMaterialRequestPayload(payload: {
  jobId: string;
  materialRequestId?: string;
  materials?: MaterialLine[];
}): Promise<void> {
  await apiClient.post<{ success: boolean }>('/materials/submit', payload);
}
