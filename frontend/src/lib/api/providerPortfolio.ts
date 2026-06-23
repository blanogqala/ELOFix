import apiClient from '@/api/client';
import type { JobCompletionEvidence } from '@/types';

export async function getProviderCompletedProjects(providerId: string): Promise<{
  projects: JobCompletionEvidence[];
  averageRating: number;
  jobsCompleted: number;
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    projects: JobCompletionEvidence[];
    averageRating: number;
    jobsCompleted: number;
  }>(`/providers/${providerId}/completed-projects`);
  return {
    projects: data?.projects ?? [],
    averageRating: data?.averageRating ?? 0,
    jobsCompleted: data?.jobsCompleted ?? 0,
  };
}
