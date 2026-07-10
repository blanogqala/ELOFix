import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getNotifications, markJobNotificationsRead } from '@/lib/api/notifications';
import {
  countSection,
  hasJobsNavActivity,
  hasRequestsNavActivity,
  jobIdsWithActivity,
  unreadForJob,
  type JobActivitySection,
} from '@/lib/jobActivityIndicators';

export function useJobActivityIndicators() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list', user?.id],
    queryFn: () => getNotifications(),
    enabled: Boolean(user?.id),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const refresh = useCallback(() => {
    if (!user?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
  }, [queryClient, user?.id]);

  const activeJobIds = useMemo(() => jobIdsWithActivity(notifications), [notifications]);

  const markJobSectionRead = useCallback(
    async (jobId: string, section: JobActivitySection | 'all' = 'all') => {
      if (!jobId) return;
      await markJobNotificationsRead(jobId, section);
      refresh();
    },
    [refresh]
  );

  return {
    notifications,
    isLoading,
    hasJobsNavActivity: hasJobsNavActivity(notifications),
    hasRequestsNavActivity: hasRequestsNavActivity(notifications),
    activeJobIds,
    jobHasActivity: (jobId: string) => activeJobIds.has(jobId),
    unreadCountForJob: (jobId: string) => unreadForJob(notifications, jobId).length,
    messagesCount: (jobId: string) => countSection(notifications, jobId, 'messages'),
    materialsCount: (jobId: string) => countSection(notifications, jobId, 'materials'),
    generalCount: (jobId: string) => countSection(notifications, jobId, 'general'),
    markJobSectionRead,
    refresh,
  };
}
