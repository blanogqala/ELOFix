import apiClient from '@/api/client';
import type { JobDispute } from '@/types';

export async function listDisputes(params?: {
  status?: string;
  requestedResolution?: string;
}): Promise<{ disputes: JobDispute[] }> {
  const { data } = await apiClient.get<{ success: boolean; disputes: JobDispute[] }>('/disputes', {
    params,
  });
  return { disputes: data?.disputes ?? [] };
}

export async function getDispute(id: string): Promise<JobDispute> {
  const { data } = await apiClient.get<{ success: boolean; dispute: JobDispute }>(`/disputes/${id}`);
  if (!data?.dispute) throw new Error('Dispute not found');
  return data.dispute;
}

export async function addDisputeMessage(
  disputeId: string,
  body: string,
  attachments?: string[]
): Promise<JobDispute> {
  const { data } = await apiClient.post<{ success: boolean; dispute: JobDispute }>(
    `/disputes/${disputeId}/messages`,
    { body, attachments }
  );
  if (!data?.dispute) throw new Error('Failed to send message');
  return data.dispute;
}

export async function submitProviderDisputeEvidence(
  disputeId: string,
  payload: {
    comment?: string;
    images?: string[];
    videos?: string[];
  }
): Promise<JobDispute> {
  const { data } = await apiClient.post<{ success: boolean; dispute: JobDispute }>(
    `/disputes/${disputeId}/provider-evidence`,
    payload
  );
  if (!data?.dispute) throw new Error('Failed to submit provider response');
  return data.dispute;
}

export async function getProviderDisputeStats(): Promise<{
  totalFlagged: number;
  openDisputes: number;
  resolvedDisputes: number;
  trustScore: number;
  trustScoreImpact: number;
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    stats: {
      totalFlagged: number;
      openDisputes: number;
      resolvedDisputes: number;
      trustScore: number;
      trustScoreImpact: number;
    };
  }>('/disputes/provider-stats');
  return (
    data?.stats ?? {
      totalFlagged: 0,
      openDisputes: 0,
      resolvedDisputes: 0,
      trustScore: 100,
      trustScoreImpact: 0,
    }
  );
}
