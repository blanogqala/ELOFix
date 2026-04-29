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
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SUPPLIER';
  phone?: string | null;
  createdAt: string;
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
  profileImage?: string;
  settings?: Provider['settings'];
  blocked?: boolean;
  reviewSubmittedAt?: string;
  supplierProfile?: SupplierAccountProfile | null;
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

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    role,
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
  role: 'user' | 'provider'
): Promise<AuthSession> {
  const response = await apiClient.post<AuthResponse>('/auth/register', {
    name,
    email,
    password,
    phone,
    role: mapFrontendRole(role),
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

export async function socialLogin(_provider: 'google'): Promise<AuthSession> {
  throw new Error('Google login is not configured in the Express auth API');
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
