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
import { Upload, X, Loader2, AlertTriangle } from 'lucide-react';
import { uploadCompletionEvidence } from '@/lib/api/jobs';
import { LoadingOverlay } from '@/components/common/loading';
import { resolveUploadUrl } from '@/lib/uploadUrl';

const RESOLUTION_OPTIONS = [
  { value: 'PROVIDER_RETURN_FIX', label: 'Provider Must Return And Fix' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'OTHER', label: 'Other' },
] as const;

interface JobDisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onSubmit: (payload: {
    comment: string;
    requestedResolution: string;
    otherResolutionDetail?: string;
    images: string[];
    videos: string[];
  }) => void;
  loading?: boolean;
}

export function JobDisputeDialog({
  open,
  onOpenChange,
  jobId,
  onSubmit,
  loading,
}: JobDisputeDialogProps) {
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState<string>('PROVIDER_RETURN_FIX');
  const [otherDetail, setOtherDetail] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

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
            Issue With Completed Work
          </DialogTitle>
          <DialogDescription>
            Describe the issue and what you would like EloFix to do. Our team will review your case.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="mb-2 block">Upload Images</Label>
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
            <Label htmlFor="dispute-comment">Comment *</Label>
            <Textarea
              id="dispute-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Describe what went wrong..."
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
                <Label htmlFor="dispute-other-detail">Please describe what you would like EloFix to do *</Label>
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
                EloFix will review your case and decide whether a partial or full refund applies.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {loading || uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit Dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <LoadingOverlay open={Boolean(loading)} message="Submitting dispute…" />
    </>
  );
}
