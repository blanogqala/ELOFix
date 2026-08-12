import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Upload, X, Loader2, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { uploadCompletionEvidence } from '@/lib/api/jobs';
import { LoadingOverlay } from '@/components/common/loading';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { formatCurrency } from '@/lib/formatCurrency';
import { buildJobCancellationFinancials } from '@/lib/jobCancellationFinancials';
import type { Job } from '@/types';
import { cn } from '@/lib/utils';

const RESOLUTION_OPTIONS = [
  { value: 'PROVIDER_RETURN_FIX', label: 'Provider Must Return And Fix' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'OTHER', label: 'Other' },
] as const;

interface JobDisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  /** When provided, shows paid-tranche financials for reject-completion context. */
  job?: Job | null;
  onSubmit: (payload: {
    comment: string;
    requestedResolution: string;
    otherResolutionDetail?: string;
    images: string[];
    videos: string[];
  }) => void;
  loading?: boolean;
}

function MoneyRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-3 text-sm', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums shrink-0">{value}</span>
    </div>
  );
}

function TrancheRow({
  label,
  amount,
  status,
}: {
  label: string;
  amount: number;
  status: 'PAID' | 'UNPAID';
}) {
  const paid = status === 'PAID';
  return (
    <div className="flex items-start gap-2 text-sm">
      {paid ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium', paid ? 'text-foreground' : 'text-muted-foreground')}>{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatCurrency(amount, { decimals: 2 })}
          {paid ? ' · Paid' : ' · Not paid'}
        </p>
      </div>
    </div>
  );
}

export function JobDisputeDialog({
  open,
  onOpenChange,
  jobId,
  job,
  onSubmit,
  loading,
}: JobDisputeDialogProps) {
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState<string>('PROVIDER_RETURN_FIX');
  const [otherDetail, setOtherDetail] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const financials = useMemo(() => (job ? buildJobCancellationFinancials(job) : null), [job]);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      let prepared = file;
      if (file.type.startsWith('image/')) {
        const { compressImageForUpload } = await import('@/lib/imageCompression');
        prepared = await compressImageForUpload(file, 1280);
      }
      const { url, kind } = await uploadCompletionEvidence(jobId, prepared);
      if (kind === 'video') setVideos((v) => [...v, url]);
      else setImages((i) => [...i, url]);
    } finally {
      setUploading(false);
    }
  };

  const otherRequiredMissing = resolution === 'OTHER' && !otherDetail.trim();
  const canSubmit = comment.trim() && !otherRequiredMissing && !loading && !uploading;

  const resetForm = () => {
    setComment('');
    setResolution('PROVIDER_RETURN_FIX');
    setOtherDetail('');
    setImages([]);
    setVideos([]);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      comment: comment.trim(),
      requestedResolution: resolution,
      otherResolutionDetail: resolution === 'OTHER' ? otherDetail.trim() : undefined,
      images,
      videos,
    });
    resetForm();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) resetForm();
          onOpenChange(next);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reject Completion &amp; Open Dispute
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  You&apos;re telling EloFix that the provider has not completed the job to the agreed
                  standard.
                </p>
                <p>
                  Your remaining payment will <span className="font-medium text-foreground">not</span>{' '}
                  be charged while the dispute is under review.
                </p>
                <p>
                  The deposit already paid is not automatically refunded. An EloFix administrator will
                  review the dispute and determine the appropriate resolution.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {financials ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment status
                </p>
                <div className="space-y-1.5">
                  <MoneyRow
                    label="Service price"
                    value={formatCurrency(financials.servicePrice, { decimals: 2 })}
                  />
                  {financials.depositStage ? (
                    <TrancheRow
                      label="Deposit paid"
                      amount={financials.depositStage.amount}
                      status={financials.depositStage.status}
                    />
                  ) : null}
                  {financials.completionStage ? (
                    <TrancheRow
                      label="Completion payment"
                      amount={financials.completionStage.amount}
                      status={financials.completionStage.status}
                    />
                  ) : null}
                  <MoneyRow
                    label="Total paid so far"
                    value={formatCurrency(financials.paidToDate, { decimals: 2 })}
                    className="pt-1 border-t border-border"
                  />
                  <MoneyRow
                    label="Amount currently under dispute"
                    value={formatCurrency(financials.amountUnderReview, { decimals: 2 })}
                    className="font-semibold"
                  />
                </div>
              </div>
            ) : null}

            <div>
              <Label className="mb-2 block">Evidence of unfinished or incorrect work (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {images.map((url) => (
                  <div key={url} className="relative h-14 w-14 rounded border overflow-hidden">
                    <img src={resolveUploadUrl(url)} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-0 right-0 bg-black/60 text-white p-0.5"
                      onClick={() => setImages((i) => i.filter((x) => x !== url))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {videos.map((url) => (
                  <div key={url} className="relative h-14 w-20 rounded border overflow-hidden">
                    <video src={resolveUploadUrl(url)} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-0 right-0 bg-black/60 text-white p-0.5"
                      onClick={() => setVideos((v) => v.filter((x) => x !== url))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded border border-dashed">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            <div>
              <Label htmlFor="dispute-comment">Reason for rejection *</Label>
              <Textarea
                id="dispute-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe what is unfinished or incorrect..."
                className="mt-1"
                rows={4}
                required
              />
            </div>

            <div>
              <Label className="mb-2 block">What would you like EloFix to do?</Label>
              <RadioGroup value={resolution} onValueChange={setResolution} className="space-y-2">
                {RESOLUTION_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={opt.value} />
                    <Label htmlFor={opt.value} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {resolution === 'OTHER' && (
                <div className="mt-3">
                  <Label htmlFor="dispute-other-detail">
                    Please describe what you would like EloFix to do *
                  </Label>
                  <Textarea
                    id="dispute-other-detail"
                    value={otherDetail}
                    onChange={(e) => setOtherDetail(e.target.value)}
                    placeholder="Describe the outcome you are looking for..."
                    className="mt-1"
                    rows={3}
                    required
                  />
                </div>
              )}
              {resolution === 'REFUND' && (
                <p className="text-xs text-muted-foreground mt-2">
                  Only amounts you have already paid can be considered for refund. An unpaid completion
                  tranche is not charged and is not refundable. EloFix will decide the final outcome.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Keep Job
            </Button>
            <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
              {loading || uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Open Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LoadingOverlay open={Boolean(loading)} message="Submitting dispute…" />
    </>
  );
}
