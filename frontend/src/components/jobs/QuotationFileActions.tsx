import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchJobQuotationBlob } from '@/lib/api/jobs';
import {
  closePreviewWindow,
  downloadQuotationBlob,
  isAppleTouchDevice,
  presentQuotationForView,
} from '@/lib/quotationOpen';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Download, ExternalLink, Loader2 } from 'lucide-react';

export interface QuotationFileActionsProps {
  jobId: string;
  fileName?: string | null;
  className?: string;
  /** Button size — provider compact row uses sm (default). */
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

function writeLoadingPlaceholder(win: Window | null, label: string): void {
  if (!win || win.closed) return;
  try {
    win.document.title = label;
    win.document.body.innerHTML = `<p style="font-family:system-ui,sans-serif;padding:1.25rem;color:#444">${label}</p>`;
  } catch {
    /* cross-origin / restricted — ignore */
  }
}

export function QuotationFileActions({
  jobId,
  fileName,
  className,
  size = 'sm',
}: QuotationFileActionsProps) {
  const { toast } = useToast();
  const [viewLoading, setViewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const clearInlinePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleView = async () => {
    // Must open synchronously inside the user gesture (mobile popup blockers).
    const previewWindow = window.open('about:blank', '_blank');
    writeLoadingPlaceholder(previewWindow, 'Loading quotation…');
    setViewLoading(true);
    try {
      const blob = await fetchJobQuotationBlob(jobId, 'inline');
      const result = presentQuotationForView(blob, previewWindow);
      if (result.mode === 'inline') {
        setPreviewUrl(result.blobUrl);
        setPreviewOpen(true);
      }
    } catch (error) {
      closePreviewWindow(previewWindow);
      toast({
        title: 'Could not open quotation',
        description: error instanceof Error ? error.message : 'Download failed.',
        variant: 'destructive',
      });
    } finally {
      setViewLoading(false);
    }
  };

  const handleDownload = async () => {
    // iOS: reserve a tab in-gesture in case Web Share is unavailable after fetch.
    const fallbackWindow = isAppleTouchDevice() ? window.open('about:blank', '_blank') : null;
    if (fallbackWindow) writeLoadingPlaceholder(fallbackWindow, 'Preparing download…');
    setDownloadLoading(true);
    try {
      const blob = await fetchJobQuotationBlob(jobId, 'attachment');
      const result = await downloadQuotationBlob(blob, fileName || 'quotation', {
        fallbackWindow,
      });
      if (result.mode === 'opened') {
        toast({
          title: 'Document opened',
          description: result.hint,
        });
      }
    } catch (error) {
      closePreviewWindow(fallbackWindow);
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        <Button
          type="button"
          variant="outline"
          size={size}
          onClick={() => void handleView()}
          disabled={viewLoading || downloadLoading}
        >
          {viewLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="mr-2 h-4 w-4" />
          )}
          View
        </Button>
        <Button
          type="button"
          variant="secondary"
          size={size}
          onClick={() => void handleDownload()}
          disabled={viewLoading || downloadLoading}
        >
          {downloadLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download
        </Button>
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) clearInlinePreview();
          else setPreviewOpen(true);
        }}
      >
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="truncate text-base pr-8">
              {fileName || 'Quotation document'}
            </DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <iframe
              title={fileName || 'Quotation preview'}
              src={previewUrl}
              className="flex-1 w-full min-h-0 border-0 bg-muted/30"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
