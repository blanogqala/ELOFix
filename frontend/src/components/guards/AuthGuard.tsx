import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentSession, getFrontendRoleFromToken, logout } from '@/lib/api/auth';
import { UserRole } from '@/types';

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/20" />
          <div className="h-4 w-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (allowedRoles?.includes('admin')) {
    const token = getCurrentSession()?.token;
    const tokenRole = token ? getFrontendRoleFromToken(token) : null;
    if (tokenRole !== 'admin') {
      logout();
      return (
        <Navigate
          to="/login"
          state={{
            from: location,
            sessionError: 'Administrator login required. Sign in with your admin account.',
          }}
          replace
        />
      );
    }
  }

  return <>{children}</>;
}
