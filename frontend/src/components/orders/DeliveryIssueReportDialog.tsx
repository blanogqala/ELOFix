import { useEffect, useState } from 'react';
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
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DeliveryIssueReason =
  | 'items_missing'
  | 'items_broken'
  | 'wrong_items'
  | 'not_received'
  | 'other';

export const DELIVERY_ISSUE_OPTIONS: { value: DeliveryIssueReason; label: string }[] = [
  { value: 'items_missing', label: 'Items missing' },
  { value: 'items_broken', label: 'Items broken or damaged' },
  { value: 'wrong_items', label: 'Wrong items delivered' },
  { value: 'not_received', label: 'Delivery not received' },
  { value: 'other', label: 'Other' },
];

interface DeliveryIssueReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: DeliveryIssueReason, details?: string) => Promise<void>;
  pending?: boolean;
}

export function DeliveryIssueReportDialog({
  open,
  onOpenChange,
  onSubmit,
  pending = false,
}: DeliveryIssueReportDialogProps) {
  const [reason, setReason] = useState<DeliveryIssueReason | ''>('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setDetails('');
    setError(null);
  }, [open]);

  const handleSubmit = async () => {
    if (!reason) {
      setError('Please select a reason.');
      return;
    }
    if (reason === 'other' && !details.trim()) {
      setError('Please describe the issue.');
      return;
    }
    setError(null);
    try {
      await onSubmit(reason, details.trim() || undefined);
    } catch {
      setError('Could not submit your report. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Report delivery issue
          </DialogTitle>
          <DialogDescription>
            Tell the branch what went wrong. They will be notified immediately and can follow up with you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>What happened?</Label>
            <div className="space-y-2">
              {DELIVERY_ISSUE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                    reason === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <input
                    type="radio"
                    name="delivery-issue-reason"
                    value={opt.value}
                    checked={reason === opt.value}
                    onChange={() => setReason(opt.value)}
                    className="mt-0.5"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="issue-details">
              Additional details{reason === 'other' ? ' (required)' : ' (optional)'}
            </Label>
            <Textarea
              id="issue-details"
              placeholder="Describe missing items, damage, or anything else the branch should know…"
              value={details}
              onChange={e => setDetails(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={pending || !reason}
            className="gap-2"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              'Report issue'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
