import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  isProviderApplicationRejected,
  isProviderAwaitingApproval,
} from '@/lib/providerAccountStatus';

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
        isRejected: false,
        hasSubmittedApplication: false,
        awaitingApproval: false,
      };
    }

    const isApproved = Boolean(user.approved);
    const isProfileComplete = Boolean(user.profileCompleted);
    const isBlocked = Boolean(user.blocked);
    const isRejected = isProviderApplicationRejected(user);
    const hasSubmittedApplication = Boolean(user.reviewSubmittedAt);
    const awaitingApproval = isProviderAwaitingApproval(user);
    const isActiveProvider = isApproved && isProfileComplete;

    return {
      isApproved,
      isProfileComplete,
      isActiveProvider,
      isBlocked,
      canWorkAsProvider: isActiveProvider && !isBlocked,
      isRejected,
      hasSubmittedApplication,
      awaitingApproval,
    };
  }, [user]);
}
