import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function useProviderStatus() {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user || user.role !== 'provider') {
      return {
        isApproved: true,
        isProfileComplete: true,
        isActiveProvider: true,
        isBlocked: false,
        canWorkAsProvider: true,
      };
    }

    const isApproved = Boolean(user.approved);
    const isProfileComplete = Boolean(user.profileCompleted);
    const isBlocked = Boolean(user.blocked);
    const isActiveProvider = isApproved && isProfileComplete;

    return {
      isApproved,
      isProfileComplete,
      isActiveProvider,
      isBlocked,
      canWorkAsProvider: isActiveProvider && !isBlocked,
    };
  }, [user]);
}
