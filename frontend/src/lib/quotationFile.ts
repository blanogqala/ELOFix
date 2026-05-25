import { FileText, FileType, ImageIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const QUOTATION_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png']);

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

export function quotationFileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  const ext = name.slice(i).toLowerCase();
  return ext === '.jpeg' ? '.jpg' : ext;
}

export function validateQuotationFileClient(file: File): { ok: true } | { ok: false; message: string } {
  const ext = quotationFileExtension(file.name);
  if (!ALLOWED_EXT.has(ext)) {
    return { ok: false, message: 'Use PDF, DOC, DOCX, JPG, or PNG (max 10MB).' };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, message: 'Unsupported file type.' };
  }
  if (file.size <= 0) {
    return { ok: false, message: 'File is empty.' };
  }
  if (file.size > QUOTATION_MAX_BYTES) {
    return { ok: false, message: 'File must be 10MB or smaller.' };
  }
  return { ok: true };
}

export function quotationFileKind(
  fileName?: string | null
): 'pdf' | 'word' | 'image' | 'unknown' {
  const ext = quotationFileExtension(fileName || '');
  if (ext === '.pdf') return 'pdf';
  if (ext === '.doc' || ext === '.docx') return 'word';
  if (ext === '.jpg' || ext === '.png') return 'image';
  return 'unknown';
}

export function quotationFileIcon(fileName?: string | null): LucideIcon {
  const kind = quotationFileKind(fileName);
  if (kind === 'image') return ImageIcon;
  if (kind === 'word') return FileType;
  return FileText;
}

export function formatQuotationFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
