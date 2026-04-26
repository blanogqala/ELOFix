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

interface JobCancellationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, details: string) => void;
  hasMaterialsPaid: boolean;
  materialsAmount: number;
  laborAmount: number;
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
}: JobCancellationDialogProps) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  const refundAmount = hasMaterialsPaid ? laborAmount : laborAmount + materialsAmount;

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason, details);
    setReason('');
    setDetails('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
          {/* Refund Info */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <p className="font-medium text-sm">Refund Breakdown</p>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Labor</span>
                <span className="text-success">+{formatCurrency(laborAmount, { decimals: 2 })}</span>
              </div>
              {!hasMaterialsPaid && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Materials (not ordered)</span>
                  <span className="text-success">+{formatCurrency(materialsAmount, { decimals: 2 })}</span>
                </div>
              )}
              {hasMaterialsPaid && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Materials (already ordered)</span>
                  <span className="text-destructive">Non-refundable</span>
                </div>
              )}
              <div className="border-t border-border pt-1 mt-1">
                <div className="flex justify-between font-medium">
                  <span>Total Refund</span>
                  <span className="text-success">{formatCurrency(refundAmount, { decimals: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Reason Selection */}
          <div>
            <Label className="mb-2 block">Reason for cancellation</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {CANCELLATION_REASONS.map(r => (
                <div key={r} className="flex items-center space-x-2">
                  <RadioGroupItem value={r} id={r} />
                  <Label htmlFor={r} className="font-normal cursor-pointer">{r}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Additional Details */}
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
          <Button 
            variant="destructive" 
            onClick={handleConfirm}
            disabled={!reason}
          >
            Cancel Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
