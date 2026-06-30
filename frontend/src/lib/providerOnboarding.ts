export const PROVIDER_ONBOARDING_STORAGE_PREFIX = 'provider_onboarding_seen_';

export type ProviderProfileLocationState = { newProviderOnboarding?: boolean };

export function getProviderOnboardingStorageKey(userId: string) {
  return `${PROVIDER_ONBOARDING_STORAGE_PREFIX}${userId}`;
}
