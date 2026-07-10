import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthUser, UserRole } from '@/types';
import * as authApi from '@/lib/api/auth';
import { collectDeviceFingerprints } from '@/hooks/useDeviceFingerprint';
import { reportDeviceContext } from '@/lib/api/fraud';
import type { LegalAcceptancePayload } from '@/lib/legal/versions';
import { queryKeys } from '@/lib/queryKeys';
import { firebaseEnabled, firebaseOnAuthStateChanged, auth as firebaseAuth } from '@/lib/firebase';
import { socket } from '@/lib/socket';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, phone: string, password: string, role: 'user' | 'provider', legalAcceptance: LegalAcceptancePayload) => Promise<AuthUser>;
  socialLogin: (provider: 'google') => Promise<AuthUser>;
  logout: () => void;
  getUserRole: () => UserRole | null;
  /** Reload provider/customer profile from GET /auth/me */
  refreshProfile: () => Promise<AuthUser | null>;
  /** Complete Google OAuth after backend redirect */
  completeGoogleAuth: (exchangeToken: string) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const invalidateJobQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
  }, [queryClient]);

  const refreshProfile = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const session = await authApi.fetchAuthMe();
      if (session?.user) {
        setUser(session.user);
        invalidateJobQueries();
        return session.user;
      }
      authApi.logout({ notifyServer: false });
      setUser(null);
    } catch {
      // Expired/invalid token: clear stale session so guards can redirect cleanly.
      authApi.logout({ notifyServer: false });
      setUser(null);
    }
    return null;
  }, [invalidateJobQueries]);

  useEffect(() => {
    if (firebaseEnabled) {
      const unsub = firebaseOnAuthStateChanged(async (fbUser) => {
        setIsLoading(true);
        try {
          if (!fbUser) {
            authApi.logout({ notifyServer: false });
            setUser(null);
            return;
          }

          const session = authApi.getCurrentSession();
          if (session?.user) {
            setUser(session.user);
            invalidateJobQueries();
            return;
          }
          const refreshed = await authApi.fetchAuthMe();
          if (refreshed?.user) {
            setUser(refreshed.user);
            invalidateJobQueries();
            return;
          }
          authApi.logout({ notifyServer: false });
          setUser(null);
        } finally {
          setIsLoading(false);
        }
      });
      setIsLoading(false);
      return () => {
        unsub?.();
      };
    }

    const session = authApi.getCurrentSession();
    if (session?.user) {
      setUser(session.user);
      if (session.token) {
        void refreshProfile().finally(() => {
          setIsLoading(false);
        });
        return;
      }
    }
    setIsLoading(false);
  }, [refreshProfile, invalidateJobQueries]);

  useEffect(() => {
    if (!user?.id) {
      socket.disconnect();
      return;
    }

    const session = authApi.getCurrentSession();
    if (session?.token) {
      socket.auth = { token: session.token };
    }
    socket.connect();
    socket.emit('join', user.id);

    return () => {
      socket.disconnect();
    };
  }, [user?.id]);

  const reportDeviceAfterAuth = () => {
    void (async () => {
      try {
        const fp = await collectDeviceFingerprints();
        await reportDeviceContext({
          ...fp,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        });
      } catch {
        /* non-blocking */
      }
    })();
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const session = await authApi.login(email, password);
      setUser(session.user);
      invalidateJobQueries();
      reportDeviceAfterAuth();
      return session.user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    name: string,
    email: string,
    phone: string,
    password: string,
    role: 'user' | 'provider',
    legalAcceptance: LegalAcceptancePayload
  ) => {
    setIsLoading(true);
    try {
      const session = await authApi.register(name, email, phone, password, role, legalAcceptance);
      setUser(session.user);
      invalidateJobQueries();
      reportDeviceAfterAuth();
      return session.user;
    } finally {
      setIsLoading(false);
    }
  };

  const socialLogin = async (provider: 'google') => {
    authApi.redirectToGoogleAuth({ mode: 'login' });
    return new Promise<AuthUser>(() => {
      /* navigation leaves the page */
    });
  };

  const completeGoogleAuth = async (exchangeToken: string) => {
    setIsLoading(true);
    try {
      const session = await authApi.exchangeGoogleAuth(exchangeToken);
      setUser(session.user);
      invalidateJobQueries();
      reportDeviceAfterAuth();
      return session.user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    if (firebaseEnabled && firebaseAuth) {
       
      firebaseAuth.signOut();
    }
  };

  const getUserRole = (): UserRole | null => {
    return user?.role || null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        socialLogin,
        completeGoogleAuth,
        logout,
        getUserRole,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
