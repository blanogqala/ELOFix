import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getNotifications } from '@/lib/api/notifications';
import { hasAdminGroupActivity, hasAdminNavActivity } from '@/lib/adminActivityIndicators';
import { socket } from '@/lib/socket';

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

  useEffect(() => {
    if (user?.role !== 'admin' || !user?.id) return;
    const onRefresh = () => refresh();
    socket.on('notification:new', onRefresh);
    socket.on('notification:read', onRefresh);
    socket.on('notification:read-all', onRefresh);
    socket.on('notification:nav-read', onRefresh);
    socket.on('message:new', onRefresh);
    return () => {
      socket.off('notification:new', onRefresh);
      socket.off('notification:read', onRefresh);
      socket.off('notification:read-all', onRefresh);
      socket.off('notification:nav-read', onRefresh);
      socket.off('message:new', onRefresh);
    };
  }, [user?.id, user?.role, refresh]);

  return {
    notifications,
    isLoading,
    hasNavActivity: (path: string) => hasAdminNavActivity(notifications, path),
    hasGroupActivity: (groupLabel: string) => hasAdminGroupActivity(notifications, groupLabel),
    refresh,
  };
}
