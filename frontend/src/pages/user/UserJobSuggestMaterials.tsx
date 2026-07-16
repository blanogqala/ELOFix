import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { JobStoreMaterialsBrowse } from '@/components/jobs/JobStoreMaterialsBrowse';
import { queryKeys } from '@/lib/queryKeys';
import { addUserMaterialSuggestion, getJobById } from '@/lib/api/jobs';
import { Loader2 } from 'lucide-react';
import { MaterialLine } from '@/types';
import { useToast } from '@/hooks/use-toast';

export default function UserJobSuggestMaterials() {
  const { id } = useParams<{ id: string }>();
  const jobId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data: job,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.jobs.detail(jobId),
    queryFn: () => getJobById(jobId),
    enabled: Boolean(jobId),
  });

  if (!jobId) {
    return (
      <DashboardLayout>
        <p className="text-sm text-muted-foreground p-6">Missing job.</p>
      </DashboardLayout>
    );
  }

  if (isLoading || !job) {
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

  const sync = async () => {
    await queryClient.refetchQueries({ queryKey: queryKeys.jobs.detail(jobId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    await queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.job(jobId) });
  };

  return (
    <DashboardLayout>
      <div className="px-3 sm:px-4 lg:px-6 pb-0">
        <JobStoreMaterialsBrowse
          variant="user_suggestion"
          jobLocation={job.location ?? undefined}
          jobCategory={job.category}
          onBack={() => navigate(`/user/jobs/${jobId}`, { replace: true })}
          onSendSuggestion={async (suggestedItems: MaterialLine[], message: string) => {
            try {
              await addUserMaterialSuggestion(jobId, suggestedItems, message);
              await sync();
              toast({
                title: 'Suggestion sent',
                description: 'Your provider will review your alternatives.',
              });
            } catch {
              toast({
                title: 'Error',
                description: 'Failed to send suggestion.',
                variant: 'destructive',
              });
              throw new Error('suggestion_failed');
            }
          }}
        />
      </div>
    </DashboardLayout>
  );
}
