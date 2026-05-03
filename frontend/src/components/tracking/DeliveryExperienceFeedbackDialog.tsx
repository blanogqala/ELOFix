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
import { Star, Package, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { submitMaterialOrderRating } from '@/lib/api/ratings';

interface DeliveryExperienceFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantLabel: string;
  materialOrderId: string | null;
  /** When false, dialog explains that ratings need a job-linked order with a provider. */
  canSubmit: boolean;
  onRated?: () => void;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { data?: { message?: string } } }).response;
    const m = r?.data?.message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Could not submit your rating. Please try again.';
}

export function DeliveryExperienceFeedbackDialog({
  open,
  onOpenChange,
  merchantLabel,
  materialOrderId,
  canSubmit,
  onRated,
}: DeliveryExperienceFeedbackDialogProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [review, setReview] = useState('');
  const [phase, setPhase] = useState<'form' | 'success'>('form');
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('form');
    setRating(0);
    setHoveredRating(0);
    setReview('');
    setSubmitError(null);
    setPending(false);
  }, [open, materialOrderId]);

  const close = () => {
    onOpenChange(false);
  };

  const submit = async () => {
    if (rating === 0 || !materialOrderId || !canSubmit) return;
    setPending(true);
    setSubmitError(null);
    try {
      await submitMaterialOrderRating({
        orderId: materialOrderId,
        rating,
        comment: review.trim() || undefined,
      });
      setPhase('success');
      onRated?.();
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            How was delivery?
          </DialogTitle>
          <DialogDescription>
            Rate your experience with {merchantLabel}. This helps others and our partners improve.
          </DialogDescription>
        </DialogHeader>

        {phase === 'success' ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
            <p className="text-lg font-semibold text-foreground">Thanks for your feedback</p>
            <p className="text-sm text-muted-foreground">Your rating has been recorded.</p>
            <Button type="button" className="btn-accent mt-2" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <>
            {!canSubmit ? (
              <p className="text-sm text-muted-foreground py-2">
                Ratings for delivery are available when your materials are tied to an active job with an assigned provider.
              </p>
            ) : null}

            <div className={cn('space-y-6 py-2', !canSubmit && 'opacity-60 pointer-events-none')}>
              <div className="text-center">
                <Label className="mb-3 block">Rating</Label>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      disabled={!canSubmit}
                      className="p-1 transition-transform hover:scale-110 disabled:opacity-50"
                    >
                      <Star
                        className={cn(
                          'h-8 w-8 transition-colors',
                          (hoveredRating || rating) >= star ? 'fill-accent text-accent' : 'text-muted-foreground'
                        )}
                      />
                    </button>
                  ))}
                </div>
                {rating > 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {rating >= 4 ? 'Glad it went well.' : rating >= 3 ? 'Thanks for the feedback.' : "We'll use this to improve."}
                  </p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="delivery-review">Comments (optional)</Label>
                <Textarea
                  id="delivery-review"
                  placeholder="Timing, packaging, instructions…"
                  value={review}
                  onChange={e => setReview(e.target.value)}
                  disabled={!canSubmit}
                  className="mt-1"
                  rows={3}
                />
              </div>

              {submitError ? (
                <p className="text-sm text-destructive" role="alert">
                  {submitError}
                </p>
              ) : null}
            </div>

            <DialogFooter className={!canSubmit ? 'sm:justify-between' : undefined}>
              <Button variant="outline" type="button" onClick={close}>
                {canSubmit ? 'Skip' : 'Close'}
              </Button>
              {canSubmit ? (
                <Button type="button" onClick={() => void submit()} disabled={rating === 0 || pending} className="btn-accent gap-2">
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    'Submit feedback'
                  )}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
