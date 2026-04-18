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
      };
    }

    const isApproved = Boolean(user.approved);
    const isProfileComplete = Boolean(user.profileCompleted);

    return {
      isApproved,
      isProfileComplete,
      isActiveProvider: isApproved && isProfileComplete && !user.blocked,
    };
  }, [user]);
}
