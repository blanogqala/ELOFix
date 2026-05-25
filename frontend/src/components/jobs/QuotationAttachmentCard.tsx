import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatCurrency';
import { fetchJobQuotationBlob } from '@/lib/api/jobs';
import { quotationFileIcon, quotationFileKind } from '@/lib/quotationFile';
import { cn } from '@/lib/utils';
import { Download, ExternalLink, FileCheck2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface QuotationAttachmentCardProps {
  jobId: string;
  serviceAmount: number;
  fileName?: string | null;
  uploadedAt?: string | null;
  serviceNote?: string | null;
  className?: string;
}

export function QuotationAttachmentCard({
  jobId,
  serviceAmount,
  fileName,
  uploadedAt,
  serviceNote,
  className,
}: QuotationAttachmentCardProps) {
  const { toast } = useToast();
  const [viewLoading, setViewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const hasFile = Boolean(fileName);
  const Icon = quotationFileIcon(fileName);
  const kind = quotationFileKind(fileName);

  const openBlob = (blob: Blob, mode: 'view' | 'download') => {
    const url = URL.createObjectURL(blob);
    if (mode === 'view') {
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName || 'quotation';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleView = async () => {
    setViewLoading(true);
    try {
      const blob = await fetchJobQuotationBlob(jobId, 'inline');
      openBlob(blob, 'view');
    } catch (error) {
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
    setDownloadLoading(true);
    try {
      const blob = await fetchJobQuotationBlob(jobId, 'attachment');
      openBlob(blob, 'download');
    } catch (error) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloadLoading(false);
    }
  };

  const uploadedLabel = uploadedAt
    ? new Date(uploadedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-gradient-to-br from-muted/30 to-background p-4 sm:p-5 shadow-sm',
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service amount</p>
          <p className="text-2xl font-bold text-primary tabular-nums">{formatCurrency(serviceAmount, { decimals: 2 })}</p>
          {serviceNote ? <p className="text-sm text-muted-foreground">{serviceNote}</p> : null}
        </div>
        {hasFile ? (
          <div className="flex shrink-0 items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">
            <FileCheck2 className="h-4 w-4" />
            <span>Quotation on file</span>
          </div>
        ) : null}
      </div>

      {hasFile ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-card/60 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quotation document
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
                  kind === 'pdf' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                  kind === 'word' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                  kind === 'image' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                  kind === 'unknown' && 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-sm" title={fileName || undefined}>
                  {fileName}
                </p>
                {uploadedLabel ? (
                  <p className="text-xs text-muted-foreground mt-0.5">Uploaded {uploadedLabel}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button variant="outline" size="sm" onClick={() => void handleView()} disabled={viewLoading}>
                {viewLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                View
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void handleDownload()} disabled={downloadLoading}>
                {downloadLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
