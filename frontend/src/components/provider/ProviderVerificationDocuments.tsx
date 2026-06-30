import { useRef, useState } from 'react';
import {
  Upload,
  FileCheck,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { uploadProviderDocument } from '@/lib/api/providers';
import { LoadingOverlay } from '@/components/common/loading';
import { compressImageForUpload } from '@/lib/imageCompression';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import {
  OPTIONAL_PROVIDER_DOCUMENTS,
  PROVIDER_DOC_ACCEPT,
  REQUIRED_PROVIDER_DOCUMENTS,
  type ProviderDocType,
  validateProviderDocumentFile,
} from '@/lib/providerDocuments';
import type { Provider } from '@/types';
import { cn } from '@/lib/utils';

type DocStatus = {
  icon: typeof CheckCircle;
  label: string;
  class: string;
};

function getDocStatus(doc?: { status?: string } | null): DocStatus | null {
  if (!doc) return null;
  switch (doc.status) {
    case 'approved':
      return { icon: CheckCircle, label: 'Approved', class: 'text-success' };
    case 'rejected':
      return { icon: AlertCircle, label: 'Rejected', class: 'text-destructive' };
    case 'pending':
    default:
      return { icon: Clock, label: 'Pending review', class: 'text-warning' };
  }
}

interface ProviderVerificationDocumentsProps {
  provider: Provider | null;
  userId: string;
  onProviderUpdated: (provider: Provider) => void | Promise<void>;
  className?: string;
}

function DocumentUploadCard({
  docType,
  label,
  description,
  required,
  provider,
  userId,
  uploading,
  onUploadStart,
  onUploadEnd,
  onProviderUpdated,
}: {
  docType: ProviderDocType;
  label: string;
  description: string;
  required: boolean;
  provider: Provider | null;
  userId: string;
  uploading: ProviderDocType | null;
  onUploadStart: (t: ProviderDocType) => void;
  onUploadEnd: () => void;
  onProviderUpdated: (p: Provider) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const doc = provider?.documents?.[docType];
  const hasFile = Boolean(doc?.url?.trim());
  const status = hasFile ? getDocStatus(doc) : null;
  const StatusIcon = status?.icon;
  const isUploading = uploading === docType;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !provider) return;

    if (!provider.hasSaIdNumber || !provider.companyRegistrationNumber) {
      toast({
        title: 'Identity details required',
        description: 'Save your SA ID number and company registration in Profile Info before uploading documents.',
        variant: 'destructive',
      });
      return;
    }

    const validationError = validateProviderDocumentFile(file);
    if (validationError) {
      toast({ title: 'Invalid file', description: validationError, variant: 'destructive' });
      return;
    }

    onUploadStart(docType);
    try {
      const uploadFile = file.type.startsWith('image/')
        ? await compressImageForUpload(file)
        : file;
      const updated = await uploadProviderDocument(userId, docType, uploadFile);
      await onProviderUpdated(updated);
      toast({
        title: 'Document uploaded',
        description: `${label} saved. Admin will review it shortly.`,
      });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Could not upload document.',
        variant: 'destructive',
      });
    } finally {
      onUploadEnd();
    }
  };

  return (
    <div
      className={cn(
        'relative flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm transition-shadow sm:p-5',
        hasFile ? 'border-primary/25' : 'border-border',
        doc?.status === 'rejected' && 'border-destructive/40'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={PROVIDER_DOC_ACCEPT}
        className="hidden"
        onChange={(e) => void handleFile(e)}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              hasFile ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            <FileText className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium leading-tight">{label}</p>
              {required ? (
                <Badge variant="outline" className="border-destructive/30 text-destructive text-xs">
                  Required
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs font-normal">
                  Optional
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, PNG, JPG, DOC, or DOCX · max 12 MB</p>
          </div>
        </div>
        {status && StatusIcon && (
          <div className={cn('flex shrink-0 items-center gap-1 text-sm font-medium', status.class)}>
            <StatusIcon className="h-4 w-4" aria-hidden />
            <span>{status.label}</span>
          </div>
        )}
      </div>

      {doc?.status === 'rejected' && doc.feedback && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {doc.feedback}
        </div>
      )}

      {hasFile && doc?.url && (
        <a
          href={resolveUploadUrl(doc.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          View uploaded file
        </a>
      )}

      <div className="flex flex-wrap gap-2">
        {(!hasFile || doc?.status === 'rejected') && (
          <Button
            type="button"
            size="sm"
            disabled={isUploading || !provider}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {doc?.status === 'rejected' ? 'Re-upload' : 'Upload'}
          </Button>
        )}
        {hasFile && doc?.status !== 'rejected' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Replace
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProviderVerificationDocuments({
  provider,
  userId,
  onProviderUpdated,
  className,
}: ProviderVerificationDocumentsProps) {
  const [uploading, setUploading] = useState<ProviderDocType | null>(null);

  return (
    <>
    <div className={cn(className)}>
      <div className="card-elevated overflow-hidden">
        <div className="border-b border-border p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
            <FileCheck className="h-5 w-5 text-primary" />
            Verification documents
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload required documents for marketplace approval. Certifications are optional but help build trust.
          </p>
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Required
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {REQUIRED_PROVIDER_DOCUMENTS.map((def) => (
                <DocumentUploadCard
                  key={def.id}
                  docType={def.id}
                  label={def.label}
                  description={def.description}
                  required={def.required}
                  provider={provider}
                  userId={userId}
                  uploading={uploading}
                  onUploadStart={setUploading}
                  onUploadEnd={() => setUploading(null)}
                  onProviderUpdated={onProviderUpdated}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Optional
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {OPTIONAL_PROVIDER_DOCUMENTS.map((def) => (
                <DocumentUploadCard
                  key={def.id}
                  docType={def.id}
                  label={def.label}
                  description={def.description}
                  required={def.required}
                  provider={provider}
                  userId={userId}
                  uploading={uploading}
                  onUploadStart={setUploading}
                  onUploadEnd={() => setUploading(null)}
                  onProviderUpdated={onProviderUpdated}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    <LoadingOverlay open={uploading !== null} message="Uploading verification…" />
    </>
  );
}
