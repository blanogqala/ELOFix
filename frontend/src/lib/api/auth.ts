import type { LegalAcceptancePayload } from '@/lib/legal/versions';
import type { AuthUser, Provider, SupplierAccountProfile, SupplierUser, UserRole } from '@/types';
import { getFromStorage, setToStorage, removeFromStorage, STORAGE_KEYS } from './storage';
import apiClient from '@/api/client';

interface AuthSession {
  user: AuthUser;
  token: string;
}

interface BackendUser {
  id: string;
  email: string;
  name: string;
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SUPPLIER' | 'BRANCH_STAFF';
  phone?: string | null;
  createdAt: string;
  branchId?: string;
  supplierOrgId?: string;
  branchUserRole?: 'MANAGER' | 'STAFF';
  approved?: boolean;
  profileCompleted?: boolean;
  businessName?: string;
  skills?: string[];
  laborPricing?: Record<string, { unit: string; rate: number }>;
  documents?: Provider['documents'];
  serviceAreas?: string[];
  workPosts?: Provider['workPosts'];
  bio?: string;
  rating?: number;
  completedJobs?: number;
  responseTime?: string;
  portfolioImages?: string[];
  profileImage?: string | null;
  settings?: Provider['settings'];
  blocked?: boolean;
  reviewSubmittedAt?: string;
  supplierProfile?: SupplierAccountProfile | null;
  completedLaborByCategory?: Provider['completedLaborByCategory'];
}

interface AuthResponse {
  success: boolean;
  user: BackendUser;
  token: string;
}

interface MeResponse {
  success: boolean;
  user: BackendUser;
}

function mapBackendRole(role: BackendUser['role']): UserRole {
  if (role === 'ADMIN') return 'admin';
  if (role === 'PROVIDER') return 'provider';
  if (role === 'SUPPLIER') return 'supplier';
  if (role === 'BRANCH_STAFF') return 'branch_staff';
  return 'user';
}

function mapFrontendRole(role: 'user' | 'provider'): BackendUser['role'] {
  if (role === 'provider') return 'PROVIDER';
  return 'CUSTOMER';
}

function toAuthUser(user: BackendUser): AuthUser {
  const role = mapBackendRole(user.role);

  if (role === 'admin') {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
    };
  }

  if (role === 'provider') {
    const docs = user.documents;
    const safeDocs =
      docs && typeof docs === 'object' && !Array.isArray(docs) ? docs : {};

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      role,
      businessName: user.businessName,
      serviceAreas: Array.isArray(user.serviceAreas) ? user.serviceAreas : [],
      skills: Array.isArray(user.skills) ? user.skills : [],
      laborPricing:
        user.laborPricing && typeof user.laborPricing === 'object'
          ? (user.laborPricing as Provider['laborPricing'])
          : {},
      documents: safeDocs,
      portfolioImages: Array.isArray(user.portfolioImages) ? user.portfolioImages : [],
      profileImage: user.profileImage || undefined,
      workPosts: Array.isArray(user.workPosts) ? user.workPosts : [],
      settings: user.settings,
      approved: Boolean(user.approved),
      profileCompleted: Boolean(user.profileCompleted),
      rating: typeof user.rating === 'number' ? user.rating : 0,
      completedJobs: typeof user.completedJobs === 'number' ? user.completedJobs : 0,
      responseTime: user.responseTime ?? 'N/A',
      bio: user.bio,
      createdAt: user.createdAt ?? new Date().toISOString(),
      blocked: user.blocked,
      reviewSubmittedAt: user.reviewSubmittedAt,
      ...(user.completedLaborByCategory &&
      typeof user.completedLaborByCategory === 'object' &&
      !Array.isArray(user.completedLaborByCategory)
        ? { completedLaborByCategory: user.completedLaborByCategory }
        : {}),
    };
  }

  if (role === 'supplier') {
    const su: SupplierUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      role: 'supplier',
      createdAt: user.createdAt ?? new Date().toISOString(),
      supplierProfile: user.supplierProfile ?? null,
    };
    return su;
  }

  if (role === 'branch_staff') {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'branch_staff',
      createdAt: user.createdAt ?? new Date().toISOString(),
      branchId: String(user.branchId || ''),
      supplierOrgId: String(user.supplierOrgId || ''),
      branchUserRole: user.branchUserRole,
    };
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    role,
    profileImage: user.profileImage || undefined,
    createdAt: user.createdAt ?? new Date().toISOString(),
  };
}

function saveSession(session: AuthSession): AuthSession {
  setToStorage(STORAGE_KEYS.AUTH, session);
  return session;
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', { email, password });

  if (!data?.token || !data?.user) {
    throw new Error('Invalid login response from server');
  }

  const session = saveSession({
    user: toAuthUser(data.user),
    token: data.token,
  });

  if (session.token) {
    return refreshSessionUser();
  }

  return session;
}

export async function register(
  name: string,
  email: string,
  phone: string,
  password: string,
  role: 'user' | 'provider',
  legalAcceptance: LegalAcceptancePayload
): Promise<AuthSession> {
  const response = await apiClient.post<AuthResponse>('/auth/register', {
    name,
    email,
    password,
    phone,
    role: mapFrontendRole(role),
    ...legalAcceptance,
  });

  const { data } = response;

  if (!data) {
    throw new Error('Invalid server response');
  }

  if ((data as { success?: boolean; error?: unknown }).success === false || (data as { error?: unknown }).error) {
    const message =
      (data as { message?: string }).message ||
      (typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : 'Registration failed');
    throw new Error(message);
  }

  if (!data.user) {
    throw new Error('Registration failed: missing user data');
  }

  const token = data.token ?? '';
  const base = saveSession({
    user: toAuthUser(data.user),
    token,
  });

  if (token) {
    return refreshSessionUser();
  }

  return base;
}

export async function fetchAuthMe(): Promise<AuthSession | null> {
  const session = getCurrentSession();
  if (!session?.token) return null;

  const { data } = await apiClient.get<MeResponse>('/auth/me');
  if (!data?.user) return null;

  return saveSession({
    user: toAuthUser(data.user),
    token: session.token,
  });
}

export async function refreshSessionUser(): Promise<AuthSession> {
  const session = getCurrentSession();
  if (!session?.token) {
    throw new Error('No session');
  }
  const next = await fetchAuthMe();
  if (!next) {
    throw new Error('Failed to refresh profile');
  }
  return next;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/change-password', { currentPassword, newPassword });
}

function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
}

export interface GoogleAuthOptions {
  mode?: 'login' | 'register';
  role?: 'CUSTOMER' | 'PROVIDER';
  next?: string;
  legalAcceptance?: LegalAcceptancePayload;
}

export function getGoogleAuthUrl(options: GoogleAuthOptions = {}): string {
  const params = new URLSearchParams();
  params.set('mode', options.mode || 'login');
  params.set('role', options.role || 'CUSTOMER');
  if (options.next) {
    params.set('next', options.next);
  }
  if (options.legalAcceptance) {
    params.set('acceptedTerms', String(options.legalAcceptance.acceptedTerms));
    params.set('acceptedPrivacy', String(options.legalAcceptance.acceptedPrivacy));
    params.set('acceptedProviderAgreement', String(options.legalAcceptance.acceptedProviderAgreement));
    params.set('acceptedRefundPolicy', String(options.legalAcceptance.acceptedRefundPolicy));
    params.set('termsVersion', options.legalAcceptance.termsVersion);
    params.set('privacyVersion', options.legalAcceptance.privacyVersion);
    params.set('providerAgreementVersion', options.legalAcceptance.providerAgreementVersion);
    params.set('refundPolicyVersion', options.legalAcceptance.refundPolicyVersion);
  }
  return `${getApiBaseUrl()}/auth/google?${params.toString()}`;
}

export function redirectToGoogleAuth(options: GoogleAuthOptions = {}): void {
  window.location.assign(getGoogleAuthUrl(options));
}

export async function exchangeGoogleAuth(exchangeToken: string): Promise<AuthSession> {
  const { data } = await apiClient.post<AuthResponse>('/auth/google/exchange', {
    exchange: exchangeToken,
  });

  if (!data?.token || !data?.user) {
    throw new Error('Invalid Google sign-in response from server');
  }

  const session = saveSession({
    user: toAuthUser(data.user),
    token: data.token,
  });

  if (session.token) {
    return refreshSessionUser();
  }

  return session;
}

export async function socialLogin(_provider: 'google'): Promise<AuthSession> {
  redirectToGoogleAuth({ mode: 'login' });
  return new Promise(() => {
    /* browser navigates away to Google OAuth */
  });
}

export function getCurrentSession(): AuthSession | null {
  return getFromStorage<AuthSession | null>(STORAGE_KEYS.AUTH, null);
}

export function logout(): void {
  removeFromStorage(STORAGE_KEYS.AUTH);
}

export function isAuthenticated(): boolean {
  return getCurrentSession() !== null;
}

export function getCurrentUser(): AuthUser | null {
  const session = getCurrentSession();
  return session?.user || null;
}

export function getUserRole(): UserRole | null {
  const user = getCurrentUser();
  return user?.role || null;
}
