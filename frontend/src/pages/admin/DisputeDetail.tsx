import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DisputeCaseDetailView } from '@/components/disputes/DisputeCaseDetailView';
import { DisputeMessageComposer } from '@/components/disputes/DisputeMessageComposer';
import {
  getAdminDisputeDetail,
  resolveAdminDispute,
  updateAdminDisputeStatus,
} from '@/lib/api/adminDisputes';
import { addDisputeMessage } from '@/lib/api/disputes';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';

function isDisputeOpen(status: string): boolean {
  return ['OPEN', 'UNDER_INVESTIGATION'].includes(String(status || '').toUpperCase());
}

export default function AdminDisputeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminDisputeDetail>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [resolveAction, setResolveAction] = useState('RELEASE_FUNDS');
  const [refundAmount, setRefundAmount] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await getAdminDisputeDetail(id);
      setData(d);
      setAdminNotes(d.dispute.adminNotes || '');
    } catch {
      toast({ title: 'Error', description: 'Failed to load dispute', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvestigate = async () => {
    if (!id) return;
    setActing(true);
    try {
      await updateAdminDisputeStatus(id, 'UNDER_INVESTIGATION', adminNotes);
      await load();
      toast({ title: 'Status updated', description: 'Marked under investigation' });
    } finally {
      setActing(false);
    }
  };

  const handleResolve = async () => {
    if (!id) return;
    setActing(true);
    try {
      await resolveAdminDispute(id, {
        action: resolveAction,
        amount: resolveAction === 'PARTIAL_REFUND' ? Number(refundAmount) : undefined,
        notes: adminNotes,
      });
      await load();
      toast({ title: 'Case resolved', description: 'Resolution applied successfully' });
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Resolution failed',
        variant: 'destructive',
      });
    } finally {
      setActing(false);
    }
  };

  const handleSendMessage = async (body: string) => {
    if (!id) return;
    await addDisputeMessage(id, body);
    await load();
    toast({ title: 'Message sent' });
  };

  if (loading || !data) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const { dispute, messages, resolutionLogs, completionEvidence, rounds } = data;
  const open = isDisputeOpen(dispute.status);
  const customerRequestedRefund = ['REFUND', 'PARTIAL_REFUND', 'FULL_REFUND'].includes(
    dispute.requestedResolution
  );
  const jobTitle = dispute.jobTitle || dispute.jobCategory || null;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/jobs/${dispute.jobId}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to job details
          </Button>
        </div>

        <DisputeCaseDetailView
          dispute={{ ...dispute, adminNotes: adminNotes || dispute.adminNotes, rounds: rounds ?? dispute.rounds }}
          messages={messages}
          resolutionLogs={resolutionLogs}
          rounds={rounds ?? dispute.rounds}
          jobTitle={jobTitle}
          footer={
            open ? (
              <DisputeMessageComposer
                placeholder="Message the customer or provider…"
                onSend={handleSendMessage}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Case closed — thread is read-only.</p>
            )
          }
        />

        {completionEvidence && (
          <div className="card-elevated p-5 sm:p-6">
            <h2 className="mb-2 font-semibold">Completion evidence</h2>
            <p className="text-sm text-muted-foreground">
              Rating: {completionEvidence.rating ?? '—'} · {completionEvidence.review || 'No review'}
            </p>
          </div>
        )}

        {open && (
          <div className="card-elevated space-y-4 p-5 sm:p-6">
            <h2 className="font-semibold">Admin resolution</h2>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Internal notes and decision summary (visible in outcome)"
              rows={3}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={acting} onClick={() => void handleInvestigate()}>
                Under investigation
              </Button>
            </div>
            <Select value={resolveAction} onValueChange={setResolveAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RELEASE_FUNDS">Release remaining funds</SelectItem>
                <SelectItem value="PARTIAL_REFUND">Partial refund</SelectItem>
                <SelectItem value="FULL_REFUND">Full refund</SelectItem>
                <SelectItem value="RETURN_PROVIDER">Return provider to site</SelectItem>
                <SelectItem value="CLOSE_CASE">Close case</SelectItem>
              </SelectContent>
            </Select>
            {customerRequestedRefund && (
              <p className="text-xs text-muted-foreground">
                Customer requested a refund; you decide partial or full amount based on investigation.
              </p>
            )}
            {resolveAction === 'PARTIAL_REFUND' && (
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                placeholder="Refund amount (ZAR)"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            )}
            <Button disabled={acting} onClick={() => void handleResolve()}>
              Apply resolution
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
