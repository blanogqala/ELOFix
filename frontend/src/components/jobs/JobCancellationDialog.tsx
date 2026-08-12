import { useState } from 'react';
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
import { AlertTriangle } from 'lucide-react';
import {
  EMPTY_CUSTOMER_CANCEL_PREVIEW,
  type CustomerCancelPreview,
} from '@/lib/jobCancellationPolicy';
import { CancellationPaymentStatus } from '@/components/jobs/CancellationPaymentStatus';

interface JobCancellationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, details: string) => void;
  hasMaterialsPaid: boolean;
  materialsAmount: number;
  cancelPreview?: CustomerCancelPreview;
  /** When set, uses Select-style reason values instead of customer radio labels. */
  reasonOptions?: { value: string; label: string }[];
  actor?: 'customer' | 'provider';
}

const CUSTOMER_CANCELLATION_REASONS = [
  'Found another provider',
  'Issue resolved on my own',
  'Cost too high',
  'Provider unresponsive',
  'Changed my mind',
  'Other',
];

export function JobCancellationDialog({
  open,
  onOpenChange,
  onConfirm,
  hasMaterialsPaid,
  materialsAmount,
  cancelPreview,
  reasonOptions,
  actor = 'customer',
}: JobCancellationDialogProps) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  const preview = cancelPreview ?? EMPTY_CUSTOMER_CANCEL_PREVIEW;

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason, details);
    setReason('');
    setDetails('');
  };

  const reasons = reasonOptions ?? CUSTOMER_CANCELLATION_REASONS.map((r) => ({ value: r, label: r }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancel Job
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this job? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {preview.warning ? (
            <div
              className={
                preview.customerForfeits || preview.opensDisputeReview
                  ? 'rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive'
                  : 'rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100'
              }
            >
              {preview.warning}
            </div>
          ) : null}

          <CancellationPaymentStatus
            preview={preview}
            actor={actor}
            hasMaterialsPaid={hasMaterialsPaid}
            materialsAmount={materialsAmount}
          />

          <div>
            <Label className="mb-2 block">Reason for cancellation</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {reasons.map((r) => (
                <div key={r.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={r.value} id={r.value} />
                  <Label htmlFor={r.value} className="font-normal cursor-pointer">
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="details">Additional details (optional)</Label>
            <Textarea
              id="details"
              placeholder="Tell us more about why you're cancelling..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep Job
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!reason}>
            Cancel Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
