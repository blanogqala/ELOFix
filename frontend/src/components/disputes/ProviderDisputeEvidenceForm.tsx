import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, X } from 'lucide-react';
import { uploadCompletionEvidence } from '@/lib/api/jobs';
import { resolveUploadUrl } from '@/lib/uploadUrl';

interface ProviderDisputeEvidenceFormProps {
  jobId: string;
  initialComment?: string | null;
  initialImages?: string[];
  initialVideos?: string[];
  disabled?: boolean;
  onSubmit: (payload: { comment: string; images: string[]; videos: string[] }) => Promise<void>;
}

export function ProviderDisputeEvidenceForm({
  jobId,
  initialComment,
  initialImages = [],
  initialVideos = [],
  disabled,
  onSubmit,
}: ProviderDisputeEvidenceFormProps) {
  const [comment, setComment] = useState(initialComment || '');
  const [images, setImages] = useState<string[]>(initialImages);
  const [videos, setVideos] = useState<string[]>(initialVideos);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setComment(initialComment || '');
    setImages(initialImages);
    setVideos(initialVideos);
  }, [initialComment, initialImages, initialVideos]);

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

  const handleSave = async () => {
    if (disabled || saving || uploading) return;
    setSaving(true);
    try {
      await onSubmit({ comment: comment.trim(), images, videos });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elevated space-y-4 p-5 sm:p-6">
      <div>
        <h3 className="font-semibold">Your response</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Explain your side and add photos or videos if helpful.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider-dispute-comment">Comment</Label>
        <Textarea
          id="provider-dispute-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          disabled={disabled || saving}
          placeholder="Describe the work completed or your position on this dispute…"
        />
      </div>
      <div className="space-y-2">
        <Label>Photos / videos</Label>
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <div key={url} className="relative">
              <img src={resolveUploadUrl(url)} alt="" className="h-16 w-16 rounded-lg object-cover" />
              {!disabled && (
                <button
                  type="button"
                  className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                  onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {videos.map((url) => (
            <div key={url} className="relative">
              <video src={resolveUploadUrl(url)} className="h-16 w-16 rounded-lg object-cover" muted />
              {!disabled && (
                <button
                  type="button"
                  className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                  onClick={() => setVideos((prev) => prev.filter((u) => u !== url))}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {!disabled && (
            <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                disabled={uploading || saving}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>
      {!disabled && (
        <Button type="button" disabled={saving || uploading || !comment.trim()} onClick={() => void handleSave()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save response
        </Button>
      )}
    </div>
  );
}
