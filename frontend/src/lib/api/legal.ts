import apiClient from '@/api/client';
import {
  buildLegalAcceptancePayload,
  type LegalAcceptancePayload,
  type LegalAcceptanceRole,
} from '@/lib/legal/versions';

export interface LegalStatusResponse {
  success: boolean;
  current: boolean;
  staleDocuments?: string[];
  requiredDocuments?: Array<{
    key: string;
    label: string;
    currentVersion: string;
    acceptedVersion: string | null;
    stale: boolean;
  }>;
}

export async function getLegalStatus(): Promise<LegalStatusResponse> {
  const { data } = await apiClient.get<LegalStatusResponse>('/legal/status');
  return data;
}

export async function acceptCurrentLegalDocuments(role: LegalAcceptanceRole): Promise<void> {
  const payload: LegalAcceptancePayload = buildLegalAcceptancePayload(role);
  await apiClient.post('/legal/accept', payload);
}
