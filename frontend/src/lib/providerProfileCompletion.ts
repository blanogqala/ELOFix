import type { Provider, ProviderSettings } from '@/types';
import { skillLaborPricingPassesOnboarding } from '@/lib/providerLaborPricing';
import { requiredDocumentsComplete, hasRejectedRequiredDocuments } from '@/lib/providerDocuments';

export type ProviderProfileSection =
  | 'profileInfo'
  | 'skillsAndPrices'
  | 'documents'
  | 'settings';

export interface ProviderProfileSectionStatus {
  profileInfo: boolean;
  skillsAndPrices: boolean;
  documents: boolean;
  settings: boolean;
  /** 0–100 based on required onboarding sections (excludes optional work posts). */
  percentCore: number;
}

export function businessHoursComplete(settings?: ProviderSettings | null): boolean {
  const hours = settings?.businessHours;
  if (!hours || typeof hours !== 'object') return false;
  return Object.values(hours).some((day) => {
    if (!day?.enabled) return false;
    const open = String(day.open || '').trim();
    const close = String(day.close || '').trim();
    if (!open || !close) return false;
    return open < close;
  });
}

/**
 * Core onboarding sections used for guided UX and progress bar.
 * Work posts are optional. Backend `profileCompleted` follows the same rules.
 * Pending service suggestions count toward skills & pricing until admin approves.
 */
export function evaluateProviderCoreSections(
  provider: Provider | null | undefined,
  local?: {
    phone: string;
    bio: string;
    serviceAreas: string[];
    selectedSkills: string[];
    pricing: Provider['laborPricing'];
    settings?: ProviderSettings | null;
    hasPendingSkillSuggestion?: boolean;
  }
): ProviderProfileSectionStatus {
  const phone = local ? local.phone.trim() : String(provider?.phone || '').trim();
  const bio = local ? local.bio.trim() : String(provider?.bio || '').trim();
  const serviceAreas = local
    ? local.serviceAreas
    : Array.isArray(provider?.serviceAreas)
      ? provider.serviceAreas
      : [];
  const selectedSkills = local
    ? local.selectedSkills
    : Array.isArray(provider?.skills)
      ? provider.skills
      : [];
  const pricing = local
    ? local.pricing
    : provider?.laborPricing && typeof provider.laborPricing === 'object'
      ? provider.laborPricing
      : {};
  const settings = local?.settings ?? provider?.settings;
  const hasPendingSkillSuggestion = Boolean(local?.hasPendingSkillSuggestion);

  const profileInfo =
    phone.length > 0 && bio.length >= 20 && serviceAreas.length >= 1;

  const selectedSkillsOk =
    selectedSkills.length > 0 &&
    selectedSkills.every((s) => skillLaborPricingPassesOnboarding(pricing[s] ?? {}));
  const skillsAndPrices = selectedSkillsOk || hasPendingSkillSuggestion;

  const documents =
    requiredDocumentsComplete(provider?.documents) &&
    !hasRejectedRequiredDocuments(provider?.documents);

  const settingsOk = businessHoursComplete(settings);

  const done = [profileInfo, skillsAndPrices, documents, settingsOk].filter(Boolean).length;

  return {
    profileInfo,
    skillsAndPrices,
    documents,
    settings: settingsOk,
    percentCore: Math.round((done / 4) * 100),
  };
}
