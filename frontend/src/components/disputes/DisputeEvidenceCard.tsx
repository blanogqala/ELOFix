import { useMemo, useState } from 'react';
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
import { Upload, X, Loader2, Plus } from 'lucide-react';
import { uploadCompletionEvidence } from '@/lib/api/jobs';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { LoadingOverlay } from '@/components/common/loading';
import type { DisputeEvidenceEntry } from '@/types';
import { cn } from '@/lib/utils';

type RoleFilter = 'CUSTOMER' | 'PROVIDER';

type AddDisputeEvidenceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  loading?: boolean;
  onSubmit: (payload: { comment: string; images: string[]; videos: string[] }) => void | Promise<void>;
};

export function AddDisputeEvidenceDialog({
  open,
  onOpenChange,
  jobId,
  loading,
  onSubmit,
}: AddDisputeEvidenceDialogProps) {
  const [comment, setComment] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setComment('');
    setImages([]);
    setVideos([]);
  };

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

  const canSubmit = Boolean(comment.trim()) && !loading && !uploading;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add evidence</DialogTitle>
            <DialogDescription>
              Add a written description and optional photos or videos. You can submit multiple
              evidence entries while the dispute is open.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="evidence-comment">Comment *</Label>
              <Textarea
                id="evidence-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="mt-1"
                placeholder="Describe the issue or your response…"
              />
            </div>
            <div>
              <Label className="mb-2 block">Photos / videos</Label>
              <div className="flex flex-wrap gap-2">
                {images.map((url) => (
                  <div key={url} className="relative h-14 w-14 overflow-hidden rounded border">
                    <img src={resolveUploadUrl(url)} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-0 top-0 bg-black/60 p-0.5 text-white"
                      onClick={() => setImages((i) => i.filter((x) => x !== url))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {videos.map((url) => (
                  <div key={url} className="relative h-14 w-20 overflow-hidden rounded border">
                    <video src={resolveUploadUrl(url)} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-0 top-0 bg-black/60 p-0.5 text-white"
                      onClick={() => setVideos((v) => v.filter((x) => x !== url))}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={() => {
                if (!canSubmit) return;
                void Promise.resolve(
                  onSubmit({ comment: comment.trim(), images, videos })
                ).then(() => {
                  reset();
                  onOpenChange(false);
                });
              }}
            >
              {loading || uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LoadingOverlay open={Boolean(loading)} message="Submitting evidence…" />
    </>
  );
}

type DisputeEvidenceCardProps = {
  title: string;
  role: RoleFilter;
  evidence: DisputeEvidenceEntry[];
  jobId: string;
  canAdd?: boolean;
  onAdd?: (payload: { comment: string; images: string[]; videos: string[] }) => void | Promise<void>;
  adding?: boolean;
  className?: string;
};

function MediaGrid({ images = [], videos = [] }: { images?: string[]; videos?: string[] }) {
  if (!images.length && !videos.length) {
    return <p className="text-xs text-muted-foreground">No media attached</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((url) => (
        <a key={url} href={resolveUploadUrl(url)} target="_blank" rel="noreferrer">
          <img
            src={resolveUploadUrl(url)}
            alt=""
            className="h-16 w-16 rounded-lg object-cover ring-1 ring-border"
          />
        </a>
      ))}
      {videos.map((url) => (
        <video
          key={url}
          src={resolveUploadUrl(url)}
          controls
          className="h-16 w-28 rounded-lg object-cover ring-1 ring-border"
        />
      ))}
    </div>
  );
}

export function DisputeEvidenceCard({
  title,
  role,
  evidence,
  jobId,
  canAdd,
  onAdd,
  adding,
  className,
}: DisputeEvidenceCardProps) {
  const [open, setOpen] = useState(false);
  const entries = useMemo(
    () => (evidence || []).filter((e) => String(e.authorRole).toUpperCase() === role),
    [evidence, role]
  );

  return (
    <div className={cn('card-elevated space-y-4 p-5 sm:p-6', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {canAdd && onAdd ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Evidence
          </Button>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No evidence submitted yet.</p>
      ) : (
        <ul className="space-y-4">
          {entries.map((entry, idx) => (
            <li key={entry.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {role === 'CUSTOMER' ? 'Evidence' : 'Response'} #{idx + 1}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              <p className="text-sm whitespace-pre-wrap">{entry.comment}</p>
              <MediaGrid images={entry.images} videos={entry.videos} />
            </li>
          ))}
        </ul>
      )}

      {canAdd && onAdd ? (
        <AddDisputeEvidenceDialog
          open={open}
          onOpenChange={setOpen}
          jobId={jobId}
          loading={adding}
          onSubmit={onAdd}
        />
      ) : null}
    </div>
  );
}
