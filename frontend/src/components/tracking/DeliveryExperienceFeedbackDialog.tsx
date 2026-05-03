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
import { Star, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeliveryExperienceFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantLabel: string;
  onSubmitFeedback: (rating: number, review: string) => void;
}

export function DeliveryExperienceFeedbackDialog({
  open,
  onOpenChange,
  merchantLabel,
  onSubmitFeedback,
}: DeliveryExperienceFeedbackDialogProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [review, setReview] = useState('');

  const submit = () => {
    if (rating === 0) return;
    onSubmitFeedback(rating, review);
    setRating(0);
    setReview('');
    onOpenChange(false);
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

        <div className="space-y-6 py-4">
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
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      'h-8 w-8 transition-colors',
                      (hoveredRating || rating) >= star
                        ? 'fill-accent text-accent'
                        : 'text-muted-foreground'
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
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button type="button" onClick={submit} disabled={rating === 0} className="btn-accent">
            Submit feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
