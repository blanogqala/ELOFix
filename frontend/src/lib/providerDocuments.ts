import type { Provider } from '@/types';

export type ProviderDocType =
  | 'idDoc'
  | 'companyReg'
  | 'proofOfAddress'
  | 'proofOfSkill'
  | 'certifications';

export type ProviderDocEntry = NonNullable<Provider['documents'][ProviderDocType]>;

export interface ProviderDocumentDefinition {
  id: ProviderDocType;
  label: string;
  description: string;
  required: boolean;
}

export const PROVIDER_DOC_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg';

export const PROVIDER_DOC_MAX_BYTES = 12 * 1024 * 1024;

const ALLOWED_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx']);

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

export const REQUIRED_PROVIDER_DOCUMENTS: ProviderDocumentDefinition[] = [
  {
    id: 'idDoc',
    label: 'ID Document',
    description: 'Government-issued photo ID (passport, national ID, or driver licence)',
    required: true,
  },
  {
    id: 'companyReg',
    label: 'Company Registration',
    description: 'CIPC certificate, business registration, or trade licence',
    required: true,
  },
  {
    id: 'proofOfAddress',
    label: 'Proof of Address',
    description: 'Utility bill, bank statement, or lease agreement (within 3 months)',
    required: true,
  },
];

export const OPTIONAL_PROVIDER_DOCUMENTS: ProviderDocumentDefinition[] = [
  {
    id: 'certifications',
    label: 'Certifications',
    description: 'Industry certifications, safety cards, or accredited course completion',
    required: false,
  },
];

/** Admin review: optional uploads shown in dashboard (excludes legacy proofOfSkill). */
export const ADMIN_OPTIONAL_PROVIDER_DOCUMENTS = OPTIONAL_PROVIDER_DOCUMENTS;

export const ALL_PROVIDER_DOCUMENTS: ProviderDocumentDefinition[] = [
  ...REQUIRED_PROVIDER_DOCUMENTS,
  ...OPTIONAL_PROVIDER_DOCUMENTS,
];

export function hasProviderDocUrl(
  documents: Provider['documents'] | undefined,
  docType: ProviderDocType
): boolean {
  const url = documents?.[docType]?.url;
  return Boolean(url && String(url).trim().length > 0);
}

export function validateProviderDocumentFile(file: File): string | null {
  const name = file.name || '';
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : '';
  if (!ext || !ALLOWED_EXT.has(ext)) {
    return 'Allowed formats: PDF, PNG, JPG, DOC, or DOCX.';
  }
  const mime = (file.type || '').toLowerCase().split(';')[0].trim();
  if (mime && !ALLOWED_MIME.has(mime)) {
    return 'Unsupported file type. Use PDF, PNG, JPG, DOC, or DOCX.';
  }
  if (file.size > PROVIDER_DOC_MAX_BYTES) {
    return 'File must be 12 MB or smaller.';
  }
  if (file.size <= 0) {
    return 'File is empty.';
  }
  return null;
}

export function computeRequiredDocumentsProgress(documents: Provider['documents'] | undefined): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = REQUIRED_PROVIDER_DOCUMENTS.length;
  const completed = REQUIRED_PROVIDER_DOCUMENTS.filter((d) =>
    hasProviderDocUrl(documents, d.id)
  ).length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function requiredDocumentsComplete(documents: Provider['documents'] | undefined): boolean {
  return computeRequiredDocumentsProgress(documents).completed ===
    computeRequiredDocumentsProgress(documents).total;
}

export function adminCanApproveProviderAccount(provider: Provider): boolean {
  if (provider.approved || provider.blocked) return false;
  if (provider.profileCompleted !== true) return false;
  return REQUIRED_PROVIDER_DOCUMENTS.every(
    (d) => provider.documents?.[d.id]?.status === 'approved'
  );
}
