import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getNotifications } from '@/lib/api/notifications';
import { hasAdminGroupActivity, hasAdminNavActivity } from '@/lib/adminActivityIndicators';

export function useAdminActivityIndicators() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list', user?.id],
    queryFn: () => getNotifications(),
    enabled: user?.role === 'admin' && Boolean(user?.id),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const refresh = useCallback(() => {
    if (!user?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
  }, [queryClient, user?.id]);

  return {
    notifications,
    isLoading,
    hasNavActivity: (path: string) => hasAdminNavActivity(notifications, path),
    hasGroupActivity: (groupLabel: string) => hasAdminGroupActivity(notifications, groupLabel),
    refresh,
  };
}
