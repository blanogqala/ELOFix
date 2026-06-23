import type { Provider, ProviderRatingBreakdown } from '@/types';

export type ProviderVerificationBadge = {
  id: string;
  label: string;
  variant: 'verified' | 'identity' | 'profile' | 'new' | 'trust' | 'bank' | 'level';
};

const NEW_PROVIDER_DAYS = 30;

export function isNewProvider(provider: Pick<Provider, 'totalReviews' | 'rating' | 'createdAt'>): boolean {
  const reviewCount = provider.totalReviews ?? 0;
  if (reviewCount > 0 || (provider.rating ?? 0) > 0) return false;
  const created = new Date(provider.createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return ageDays <= NEW_PROVIDER_DAYS;
}

export function getProviderVerificationBadges(provider: Provider): ProviderVerificationBadge[] {
  const badges: ProviderVerificationBadge[] = [];
  const summary = provider.verificationSummary;
  const docs = provider.documents;

  if (summary?.verifiedId || docs?.idDoc?.status === 'approved') {
    badges.push({ id: 'verified-id', label: 'Verified ID', variant: 'identity' });
  }
  if (summary?.verifiedCompany || docs?.companyReg?.status === 'approved') {
    badges.push({ id: 'verified-company', label: 'Verified Company', variant: 'verified' });
  }
  if (summary?.verifiedBankAccount) {
    badges.push({ id: 'verified-bank', label: 'Verified Bank Account', variant: 'bank' });
  }
  if (provider.approved) {
    badges.push({ id: 'verified', label: 'Verified Provider', variant: 'verified' });
  }
  const level = summary?.trustLevel || provider.trustLevel;
  if (level?.label) {
    badges.push({ id: 'trust-level', label: level.label, variant: 'level' });
  }
  if (provider.profileCompleted) {
    badges.push({ id: 'profile', label: 'Complete Profile', variant: 'profile' });
  }
  if (isNewProvider(provider)) {
    badges.push({ id: 'new', label: 'New Provider', variant: 'new' });
  }
  return badges;
}

export function formatReviewCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return 'No ratings yet';
  return `${n.toLocaleString()} review${n === 1 ? '' : 's'}`;
}

export function breakdownTotal(breakdown: ProviderRatingBreakdown): number {
  return Object.values(breakdown).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

export function breakdownPercent(breakdown: ProviderRatingBreakdown, star: 1 | 2 | 3 | 4 | 5): number {
  const total = breakdownTotal(breakdown);
  if (total <= 0) return 0;
  return Math.round(((Number(breakdown[star]) || 0) / total) * 100);
}
