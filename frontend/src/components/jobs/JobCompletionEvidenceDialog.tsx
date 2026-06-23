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
import { Star, Upload, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadCompletionEvidence } from '@/lib/api/jobs';
import { resolveUploadUrl } from '@/lib/uploadUrl';

const MAX_IMAGES = 10;
const MAX_VIDEOS = 3;

interface JobCompletionEvidenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onSubmit: (rating: number, review: string, images: string[], videos: string[]) => void;
  loading?: boolean;
}

export function JobCompletionEvidenceDialog({
  open,
  onOpenChange,
  jobId,
  onSubmit,
  loading,
}: JobCompletionEvidenceDialogProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [review, setReview] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File, kind: 'image' | 'video') => {
    if (kind === 'image' && images.length >= MAX_IMAGES) return;
    if (kind === 'video' && videos.length >= MAX_VIDEOS) return;
    setUploading(true);
    try {
      let prepared = file;
      if (kind === 'image') {
        const { compressImageForUpload } = await import('@/lib/imageCompression');
        prepared = await compressImageForUpload(file, 1280);
      }
      const { url, kind: uploadedKind } = await uploadCompletionEvidence(jobId, prepared);
      if (uploadedKind === 'video') setVideos((v) => [...v, url]);
      else setImages((i) => [...i, url]);
    } finally {
      setUploading(false);
    }
  };

  const hasMedia = images.length > 0 || videos.length > 0;
  const canSubmit = rating > 0 && hasMedia && !loading && !uploading;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(rating, review, images, videos);
    setRating(0);
    setReview('');
    setImages([]);
    setVideos([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Your Results</DialogTitle>
          <DialogDescription>
            You are confirming the work is complete. Share photos or videos of the finished work to help
            other customers — you can upload pictures, videos, or both. You do not need both types, but at
            least one photo or one video is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label className="mb-2 block">Upload Images (max {MAX_IMAGES})</Label>
            <div className="flex flex-wrap gap-2">
              {images.map((url) => (
                <div key={url} className="relative h-16 w-16 rounded-md overflow-hidden border">
                  <img src={resolveUploadUrl(url)} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-0 right-0 bg-black/60 p-0.5 text-white"
                    onClick={() => setImages((i) => i.filter((x) => x !== url))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f, 'image');
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Optional if you upload a video below. At least one photo or video is required overall.
            </p>
          </div>

          <div>
            <Label className="mb-2 block">Upload Videos (max {MAX_VIDEOS})</Label>
            <div className="flex flex-wrap gap-2">
              {videos.map((url) => (
                <div key={url} className="relative rounded-md border px-2 py-1 text-xs">
                  Video
                  <button
                    type="button"
                    className="ml-2 text-destructive"
                    onClick={() => setVideos((v) => v.filter((x) => x !== url))}
                  >
                    <X className="h-3 w-3 inline" />
                  </button>
                </div>
              ))}
              {videos.length < MAX_VIDEOS && (
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                  <Upload className="h-4 w-4" />
                  Add video
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f, 'video');
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Optional if you upload photos above. At least one photo or video is required overall.
            </p>
          </div>

          <div>
            <Label htmlFor="evidence-review">Comment</Label>
            <Textarea
              id="evidence-review"
              placeholder="Tell others about the work completed."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="text-center">
            <Label className="mb-2 block">Rating *</Label>
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
                      'h-8 w-8 transition-colors',
                      (hoveredRating || rating) >= star
                        ? 'fill-accent text-accent'
                        : 'text-muted-foreground'
                    )}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && !hasMedia && (
              <p className="text-xs text-muted-foreground mt-2">
                Add at least one photo or video to continue.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="btn-accent">
            {loading || uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit & Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
