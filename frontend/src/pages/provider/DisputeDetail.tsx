import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { DisputeCaseDetailView } from '@/components/disputes/DisputeCaseDetailView';
import { DisputeMessageComposer } from '@/components/disputes/DisputeMessageComposer';
import { ProviderDisputeEvidenceForm } from '@/components/disputes/ProviderDisputeEvidenceForm';
import {
  addDisputeMessage,
  getDispute,
  submitProviderDisputeEvidence,
} from '@/lib/api/disputes';
import type { JobDispute } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';

function isDisputeOpen(status: string): boolean {
  return ['OPEN', 'UNDER_INVESTIGATION'].includes(String(status || '').toUpperCase());
}

export default function ProviderDisputeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dispute, setDispute] = useState<JobDispute | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setDispute(await getDispute(id));
    } catch {
      toast({ title: 'Error', description: 'Could not load dispute case.', variant: 'destructive' });
      setDispute(null);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSendMessage = async (body: string) => {
    if (!id) return;
    const updated = await addDisputeMessage(id, body);
    setDispute(updated);
    toast({ title: 'Message sent' });
  };

  const handleSubmitEvidence = async (payload: {
    comment: string;
    images: string[];
    videos: string[];
  }) => {
    if (!id) return;
    const updated = await submitProviderDisputeEvidence(id, payload);
    setDispute(updated);
    toast({ title: 'Response saved', description: 'Your dispute response was updated.' });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!dispute) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => navigate('/provider/jobs?view=disputes')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Flagged Jobs
          </Button>
          <p className="text-muted-foreground">Dispute not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  const jobTitle = dispute.job?.title || dispute.job?.categoryName || null;
  const open = isDisputeOpen(dispute.status);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(dispute.jobId ? `/provider/jobs/${dispute.jobId}` : '/provider/jobs?view=disputes')
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to job
          </Button>
          {dispute.jobId && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/provider/jobs/${dispute.jobId}`)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Job details
            </Button>
          )}
        </div>

        <DisputeCaseDetailView
          dispute={dispute}
          jobTitle={jobTitle}
          footer={
            open ? (
              <DisputeMessageComposer
                placeholder="Reply to EloFix or the customer…"
                onSend={handleSendMessage}
              />
            ) : (
              <p className="text-sm text-muted-foreground">This case is closed. Messages are read-only.</p>
            )
          }
        />

        {open && dispute.jobId && (
          <ProviderDisputeEvidenceForm
            jobId={dispute.jobId}
            initialComment={dispute.providerComment}
            initialImages={dispute.providerImages}
            initialVideos={dispute.providerVideos}
            onSubmit={handleSubmitEvidence}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
