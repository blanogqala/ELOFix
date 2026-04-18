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
import { Star, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (rating: number, review: string) => void;
  providerName: string;
}

export function JobCompletionDialog({
  open,
  onOpenChange,
  onConfirm,
  providerName,
}: JobCompletionDialogProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [review, setReview] = useState('');

  const handleConfirm = () => {
    if (rating === 0) return;
    onConfirm(rating, review);
    setRating(0);
    setReview('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            Confirm Job Completion
          </DialogTitle>
          <DialogDescription>
            Please rate your experience with {providerName} to complete this job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Star Rating */}
          <div className="text-center">
            <Label className="mb-3 block">How would you rate this service?</Label>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
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
                      "h-8 w-8 transition-colors",
                      (hoveredRating || rating) >= star
                        ? "fill-accent text-accent"
                        : "text-muted-foreground"
                    )}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                {rating === 5 && "Excellent!"}
                {rating === 4 && "Great!"}
                {rating === 3 && "Good"}
                {rating === 2 && "Fair"}
                {rating === 1 && "Poor"}
              </p>
            )}
          </div>

          {/* Review */}
          <div>
            <Label htmlFor="review">Write a review</Label>
            <Textarea
              id="review"
              placeholder="Share your experience with this provider..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="mt-1"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Your review helps other users find great providers.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={rating === 0}
            className="btn-accent"
          >
            Submit & Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
