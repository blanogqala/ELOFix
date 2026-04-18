// LocalStorage persistence layer for MVP
// This can be replaced with real API calls later

const STORAGE_KEYS = {
  AUTH: 'fixmate_auth',
  CURRENT_USER: 'fixmate_current_user',
  USERS: 'fixmate_users',
  PROVIDERS: 'fixmate_providers',
  JOBS: 'fixmate_jobs',
  SUPPLIERS: 'fixmate_suppliers',
  CARDS: 'fixmate_cards',
  INVOICES: 'fixmate_invoices',
  NOTIFICATIONS: 'fixmate_notifications',
  SPECIALS: 'fixmate_specials',
  USER_PROFILE: 'fixmate_user_profile',
  PROVIDER_DELETED_REJECTED: 'fixmate_provider_deleted_rejected',
} as const;

export function getFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}

export function removeFromStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to remove from localStorage:', error);
  }
}

export { STORAGE_KEYS };
