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
import { formatCurrency } from '@/lib/formatCurrency';
import {
  EMPTY_CUSTOMER_CANCEL_PREVIEW,
  type CustomerCancelPreview,
} from '@/lib/jobCancellationPolicy';

interface JobCancellationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, details: string) => void;
  hasMaterialsPaid: boolean;
  materialsAmount: number;
  laborAmount: number;
  cancelPreview?: CustomerCancelPreview;
}

const CANCELLATION_REASONS = [
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
  laborAmount,
  cancelPreview,
}: JobCancellationDialogProps) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  const preview = cancelPreview ?? EMPTY_CUSTOMER_CANCEL_PREVIEW;
  const laborRefund = preview.customerForfeits ? 0 : preview.laborRefund;
  const materialsRefund =
    preview.materialsRefundable && !hasMaterialsPaid ? materialsAmount : 0;
  const totalRefund = preview.refundAmount;

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason, details);
    setReason('');
    setDetails('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
                preview.customerForfeits
                  ? 'rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive'
                  : 'rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100'
              }
            >
              {cancelPreview.warning}
            </div>
          ) : null}

          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <p className="font-medium text-sm">Refund breakdown</p>
            <div className="text-sm space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Labor / service</span>
                {laborRefund > 0 ? (
                  <span className="text-success shrink-0">+{formatCurrency(laborRefund, { decimals: 2 })}</span>
                ) : laborAmount > 0 && preview.customerForfeits ? (
                  <span className="text-destructive shrink-0 text-right">Non-refundable</span>
                ) : (
                  <span className="text-muted-foreground shrink-0">—</span>
                )}
              </div>
              {!hasMaterialsPaid && materialsRefund > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Materials (not ordered)</span>
                  <span className="text-success shrink-0">
                    +{formatCurrency(materialsRefund, { decimals: 2 })}
                  </span>
                </div>
              )}
              {hasMaterialsPaid && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Materials (already ordered)</span>
                  <span className="text-destructive shrink-0 text-right">Non-refundable</span>
                </div>
              )}
              <div className="border-t border-border pt-1 mt-1">
                <div className="flex justify-between font-medium gap-2">
                  <span>Total refund</span>
                  <span className={totalRefund > 0 ? 'text-success shrink-0' : 'text-muted-foreground shrink-0'}>
                    {formatCurrency(totalRefund, { decimals: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Reason for cancellation</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {CANCELLATION_REASONS.map((r) => (
                <div key={r} className="flex items-center space-x-2">
                  <RadioGroupItem value={r} id={r} />
                  <Label htmlFor={r} className="font-normal cursor-pointer">
                    {r}
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
