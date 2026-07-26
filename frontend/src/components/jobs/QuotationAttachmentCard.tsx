import { formatCurrency } from '@/lib/formatCurrency';
import { quotationFileIcon, quotationFileKind } from '@/lib/quotationFile';
import { cn } from '@/lib/utils';
import { FileCheck2 } from 'lucide-react';
import { QuotationFileActions } from '@/components/jobs/QuotationFileActions';

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
  const hasFile = Boolean(fileName);
  const Icon = quotationFileIcon(fileName);
  const kind = quotationFileKind(fileName);

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
            <QuotationFileActions jobId={jobId} fileName={fileName} className="sm:justify-end" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
