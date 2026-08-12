import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, Upload, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadCompletionEvidence } from '@/lib/api/jobs';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { ProfileAvatar } from '@/components/common/ProfileAvatar';

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

type Props = {
  jobId: string;
  providerName?: string;
  providerImage?: string | null;
  submitting?: boolean;
  onSubmit: (payload: {
    rating: number;
    comment: string;
    images: string[];
    videos: string[];
  }) => void | Promise<void>;
  className?: string;
  /**
   * When true, render form fields only (no outer Card / provider header)
   * for embedding inside the Provider section.
   */
  embedded?: boolean;
};

/**
 * Rate & Review form for COMPLETED jobs (photos optional; rating required).
 * Uploads via existing completion-evidence endpoint.
 */
export function JobReviewFormCard({
  jobId,
  providerName = 'Provider',
  providerImage,
  submitting,
  onSubmit,
  className,
  embedded = false,
}: Props) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleImageFile = async (file: File) => {
    setUploadError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setUploadError('Unsupported file type. Use JPG, JPEG, or PNG.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError('Image is too large (max 10MB).');
      return;
    }
    if (images.length >= MAX_IMAGES) {
      setUploadError(`Maximum ${MAX_IMAGES} photos.`);
      return;
    }
    setUploading(true);
    try {
      const { compressImageForUpload } = await import('@/lib/imageCompression');
      const prepared = await compressImageForUpload(file, 1280);
      const { url } = await uploadCompletionEvidence(jobId, prepared);
      setImages((prev) => [...prev, url]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = rating >= 1 && rating <= 5 && !submitting && !uploading;

  const handleSubmit = async () => {
    setFormError(null);
    if (rating < 1 || rating > 5) {
      setFormError('Please select a rating from 1 to 5 stars.');
      return;
    }
    if (uploading) return;
    await onSubmit({ rating, comment: comment.trim(), images, videos: [] });
  };

  const fields = (
    <>
      <div className="text-center sm:text-left">
        <Label className="mb-2 block">Rate your experience *</Label>
        <div className="flex justify-center gap-2 sm:justify-start" role="group" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
              aria-pressed={rating === star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              className="p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
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
      </div>

      <div>
        <Label htmlFor={`job-review-comment-${jobId}`}>Tell us about your experience</Label>
        <Textarea
          id={`job-review-comment-${jobId}`}
          placeholder="Write your review…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="mt-1"
          rows={4}
        />
      </div>

      <div>
        <Label className="mb-2 block">Add photos of the completed work</Label>
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
              <img src={resolveUploadUrl(url)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                className="absolute top-0 right-0 bg-black/60 p-0.5 text-white"
                aria-label="Remove photo"
                onClick={() => setImages((prev) => prev.filter((x) => x !== url))}
                disabled={uploading || submitting}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES ? (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted/40">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              <span>Upload</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                className="sr-only"
                disabled={uploading || submitting}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImageFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          JPG, JPEG, or PNG · max {MAX_IMAGES} photos · optional
        </p>
        {uploadError ? <p className="mt-1 text-xs text-destructive">{uploadError}</p> : null}
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <div className="flex justify-end">
        <Button type="button" className="btn-accent" disabled={!canSubmit} onClick={() => void handleSubmit()}>
          {submitting || uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Submit Review
        </Button>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className={cn('space-y-5', className)}>
        <div>
          <p className="font-medium">Rate &amp; Review Provider</p>
          <p className="text-sm text-muted-foreground">How was your experience?</p>
        </div>
        {fields}
      </div>
    );
  }

  return (
    <Card className={cn('border-border', className)}>
      <CardHeader className="space-y-3">
        <CardTitle className="text-lg">Rate &amp; Review Provider</CardTitle>
        <div className="flex items-center gap-3">
          <ProfileAvatar
            name={providerName}
            imageUrl={providerImage || undefined}
            className="h-12 w-12"
            fallbackClassName="text-lg font-semibold"
          />
          <div>
            <p className="font-medium">{providerName}</p>
            <p className="text-sm text-muted-foreground">How was your experience?</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{fields}</CardContent>
    </Card>
  );
}
