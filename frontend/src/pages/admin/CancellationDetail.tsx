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

function isCaseOpen(status: string): boolean {
  return ['OPEN', 'UNDER_INVESTIGATION'].includes(String(status || '').toUpperCase());
}

export default function AdminCancellationDetail() {
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
      toast({ title: 'Error', description: 'Failed to load case', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const jobMeta = (data?.job as { cancellationSource?: string } | null) ?? null;
  const isCancellation =
    jobMeta?.cancellationSource === 'customer_cancel' || jobMeta?.cancellationSource === 'provider_cancel';

  useEffect(() => {
    if (!id) return;
    if (!data) return;
    if (isCancellation) return;
    navigate(`/admin/disputes/${id}`, { replace: true });
  }, [id, data, isCancellation, navigate]);

  if (loading || !data) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const { dispute, messages, resolutionLogs, rounds, job } = data;
  const open = isCaseOpen(dispute.status);

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
          caseKind="cancellation"
          footer={
            open ? (
              <DisputeMessageComposer placeholder="Message the customer or provider…" onSend={handleSendMessage} />
            ) : (
              <p className="text-sm text-muted-foreground">Case closed — thread is read-only.</p>
            )
          }
        />

        {open && (
          <div className="card-elevated space-y-4 p-5 sm:p-6">
            <h2 className="font-semibold">Admin resolution</h2>
            <div className="space-y-2">
              <label className="text-sm font-medium">Admin notes</label>
              <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Action</label>
                <Select value={resolveAction} onValueChange={setResolveAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RELEASE_FUNDS">Release funds</SelectItem>
                    <SelectItem value="PARTIAL_REFUND">Partial refund</SelectItem>
                    <SelectItem value="FULL_REFUND">Full refund</SelectItem>
                    <SelectItem value="CLOSE_CASE">Close case</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {resolveAction === 'PARTIAL_REFUND' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Refund amount</label>
                  <input
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    inputMode="decimal"
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={acting} onClick={() => void handleInvestigate()}>
                Mark under investigation
              </Button>
              <Button className="btn-accent" disabled={acting} onClick={() => void handleResolve()}>
                Apply resolution
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

