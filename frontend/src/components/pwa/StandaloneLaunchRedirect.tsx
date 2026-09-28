import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isStandaloneDisplay, standaloneHomeDashboardPath } from '@/pwa/standaloneLaunch';

/** Runs once per page load so later in-app visits to the marketing home stay put. */
export function StandaloneLaunchRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (isLoading || ran.current) return;
    ran.current = true;
    if (!isStandaloneDisplay()) return;
    const destination = standaloneHomeDashboardPath({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      isAuthenticated,
      role: user?.role,
    });
    if (!destination || destination === window.location.pathname) return;
    navigate(destination, { replace: true });
  }, [isAuthenticated, isLoading, navigate, user]);

  return null;
}
