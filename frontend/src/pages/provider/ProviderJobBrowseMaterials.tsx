import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { JobStoreMaterialsBrowse } from '@/components/jobs/JobStoreMaterialsBrowse';
import { queryKeys } from '@/lib/queryKeys';
import { getJobById } from '@/lib/api/jobs';
import {
  createMaterialRequestDraft,
  getMaterialRequestsForJob,
} from '@/lib/api/materialRequests';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MaterialLine } from '@/types';

export default function ProviderJobBrowseMaterials() {
  const { id } = useParams<{ id: string }>();
  const jobId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: job, isLoading: jobLoading, isError, error } = useQuery({
    queryKey: queryKeys.jobs.detail(jobId),
    queryFn: () => getJobById(jobId),
    enabled: Boolean(jobId),
  });

  const { data: materialRows, isFetching: draftsLoading } = useQuery({
    queryKey: queryKeys.materialRequests.job(jobId),
    queryFn: () => getMaterialRequestsForJob(jobId),
    enabled: Boolean(jobId),
  });

  const draftMaterials: MaterialLine[] = (() => {
    const draft = materialRows?.find((r) => r.status === 'draft');
    if (draft?.items?.length) return draft.items as MaterialLine[];
    return [];
  })();

  if (!jobId) {
    return (
      <DashboardLayout>
        <p className="text-sm text-muted-foreground p-6">Missing job.</p>
      </DashboardLayout>
    );
  }

  if (jobLoading || draftsLoading || !job) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center gap-3 min-h-[50vh] text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Loading job…</span>
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <p className="text-sm text-destructive p-6">
          {error instanceof Error ? error.message : 'Failed to load job.'}
        </p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-3 sm:px-4 lg:px-6 pb-0">
        <JobStoreMaterialsBrowse
          variant="provider_cart"
          jobLocation={job.location ?? undefined}
          jobCategory={job.category}
          existingMaterials={draftMaterials}
          onBack={() => navigate(`/provider/jobs/${jobId}`, { replace: true })}
          onSaveCart={(mats) =>
            createMaterialRequestDraft({ jobId, items: mats })
              .then(() =>
                queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.job(jobId) })
              )
              .catch((err: unknown) => {
                toast({
                  title: 'Could not save draft',
                  description: err instanceof Error ? err.message : 'Try again.',
                  variant: 'destructive',
                });
                throw err;
              })
          }
        />
      </div>
    </DashboardLayout>
  );
}
