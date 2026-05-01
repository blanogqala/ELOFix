import type { Provider } from '@/types';

export type ProviderProfileSection = 'profileInfo' | 'skillsAndPrices' | 'documents';

export interface ProviderProfileSectionStatus {
  profileInfo: boolean;
  skillsAndPrices: boolean;
  documents: boolean;
  /** 0–100 based on the three guided sections (user-facing workflow). */
  percentCore: number;
}

function hasDocUrl(doc?: { url?: string } | null): boolean {
  return Boolean(doc?.url && String(doc.url).trim().length > 0);
}

/**
 * Core onboarding sections (Profile / Skills / Documents) used for guided UX.
 * Backend `profileCompleted` may also require work posts — see provider service.
 */
export function evaluateProviderCoreSections(
  provider: Provider | null | undefined,
  local?: {
    phone: string;
    businessName: string;
    bio: string;
    serviceAreas: string[];
    selectedSkills: string[];
    pricing: Provider['laborPricing'];
  }
): ProviderProfileSectionStatus {
  const phone = local ? local.phone.trim() : String(provider?.phone || '').trim();
  const businessName = local
    ? local.businessName.trim()
    : String(provider?.businessName || '').trim();
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

  const profileInfo =
    phone.length > 0 &&
    businessName.length > 0 &&
    bio.length >= 20 &&
    serviceAreas.length >= 1;

  const skillsAndPrices =
    selectedSkills.length > 0 &&
    selectedSkills.every((s) => {
      const pr = pricing[s];
      return Boolean(pr && Number(pr.rate) > 0);
    });

  const documents =
    hasDocUrl(provider?.documents?.idDoc) && hasDocUrl(provider?.documents?.proofOfSkill);

  const done = [profileInfo, skillsAndPrices, documents].filter(Boolean).length;

  return {
    profileInfo,
    skillsAndPrices,
    documents,
    percentCore: Math.round((done / 3) * 100),
  };
}
