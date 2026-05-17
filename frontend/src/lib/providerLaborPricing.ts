import { formatCurrency } from '@/lib/formatCurrency';
import type { Provider, ProviderLaborPricingEntry } from '@/types';

export type ServiceLaborEstimate =
  | { kind: 'history'; low: number; high: number; jobCount: number }
  | { kind: 'range'; low: number; high: number }
  | { kind: 'none' };

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Draft validation for profile save — empty range OK for new providers. */
export function validateSkillPricingDraft(
  entry: ProviderLaborPricingEntry | undefined
): { ok: boolean; message?: string } {
  if (!entry || typeof entry !== 'object') {
    return { ok: true };
  }
  const low = num(entry.jobFeeLow);
  const high = num(entry.jobFeeHigh);
  const hasLow = low != null && low > 0;
  const hasHigh = high != null && high > 0;

  if (hasLow !== hasHigh) {
    return {
      ok: false,
      message: 'Enter both lowest and highest job amounts (Rand), or leave both blank.',
    };
  }
  if (hasLow && hasHigh && low > high!) {
    return { ok: false, message: 'Highest amount must be at least equal to lowest.' };
  }
  return { ok: true };
}

/** Whether onboarding “skills & prices” checklist passes (ranges optional until first jobs). */
export function skillLaborPricingPassesOnboarding(entry: ProviderLaborPricingEntry | undefined): boolean {
  return validateSkillPricingDraft(entry).ok;
}

/**
 * Customer-facing labour estimate for the selected category.
 * Prefers aggregates from completed, labour-paid jobs; then declared jobFeeLow/High.
 * Does not expose legacy per-hour/per-unit rates in customer flows.
 */
export function getServiceLaborEstimate(provider: Provider | undefined | null, categoryId: string): ServiceLaborEstimate {
  const cid = String(categoryId ?? '').trim();
  if (!provider || !cid) return { kind: 'none' };

  const hist = provider.completedLaborByCategory?.[cid];
  if (hist && hist.jobCount > 0 && hist.min > 0 && hist.max > 0) {
    const low = Math.min(hist.min, hist.max);
    const high = Math.max(hist.min, hist.max);
    return { kind: 'history', low, high, jobCount: hist.jobCount };
  }

  const raw = provider.laborPricing?.[cid];
  const low = num(raw?.jobFeeLow);
  const high = num(raw?.jobFeeHigh);

  if (low != null && high != null && low > 0 && high > 0) {
    if (low <= high) return { kind: 'range', low, high };
    return { kind: 'range', low: high, high: low };
  }

  return { kind: 'none' };
}

export function formatServiceLaborEstimateShort(est: ServiceLaborEstimate): string {
  if (est.kind === 'history' || est.kind === 'range') {
    return `${formatCurrency(est.low)} – ${formatCurrency(est.high)}`;
  }
  return 'Pricing on request';
}

export function formatServiceLaborEstimateDescription(est: ServiceLaborEstimate): string {
  if (est.kind === 'history') {
    const n = est.jobCount;
    const jobs = n === 1 ? '1 completed job' : `${n} completed jobs`;
    return `Based on labour actually paid on ${jobs} for this service on EloFix (estimate). Final price is confirmed after inspection.`;
  }
  if (est.kind === 'range') {
    return 'Typical whole-job labour range this provider has declared (excluding materials). Final quote after inspection.';
  }
  return 'This provider has not published a guideline or past paid jobs in this category yet — labour will be quoted after inspection.';
}
