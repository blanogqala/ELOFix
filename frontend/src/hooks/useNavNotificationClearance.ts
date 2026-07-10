import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { markNavNotificationsRead } from '@/lib/api/notifications';
import { resolveNavClearancePath } from '@/lib/navNotificationClearance';

export function useNavNotificationClearance() {
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const lastClearedRef = useRef<string | null>(null);

  const invalidateNotifications = useCallback(() => {
    if (!user?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const navPath = resolveNavClearancePath(location.pathname, user.role);
    if (!navPath) return;

    const dedupeKey = `${navPath}:${location.pathname}`;
    if (lastClearedRef.current === dedupeKey) return;
    lastClearedRef.current = dedupeKey;

    void markNavNotificationsRead(navPath)
      .then(() => invalidateNotifications())
      .catch(() => {
        lastClearedRef.current = null;
      });
  }, [location.pathname, user?.id, user?.role, invalidateNotifications]);
}
