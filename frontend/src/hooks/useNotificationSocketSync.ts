import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { socket } from '@/lib/socket';

type NotificationPayload = {
  type?: string;
};

type UseNotificationSocketSyncOptions = {
  onNotificationNew?: (notification?: NotificationPayload) => void;
};

export function useNotificationSocketSync(options: UseNotificationSocketSyncOptions = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const onNotificationNew = options.onNotificationNew;

  const invalidateNotifications = useCallback(() => {
    if (!user?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const handleNotificationNew = (notification?: NotificationPayload) => {
      invalidateNotifications();
      onNotificationNew?.(notification);
    };
    const handleRefresh = () => invalidateNotifications();

    socket.on('notification:new', handleNotificationNew);
    socket.on('message:new', handleRefresh);
    socket.on('notification:read', handleRefresh);
    socket.on('notification:read-all', handleRefresh);
    socket.on('notification:nav-read', handleRefresh);
    socket.on('notification:job-read', handleRefresh);

    return () => {
      socket.off('notification:new', handleNotificationNew);
      socket.off('message:new', handleRefresh);
      socket.off('notification:read', handleRefresh);
      socket.off('notification:read-all', handleRefresh);
      socket.off('notification:nav-read', handleRefresh);
      socket.off('notification:job-read', handleRefresh);
    };
  }, [invalidateNotifications, onNotificationNew, user?.id]);
}
