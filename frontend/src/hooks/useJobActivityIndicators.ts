import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getPendingRequestsForProvider } from '@/lib/api/jobs';
import { getNotifications, markJobNotificationsRead } from '@/lib/api/notifications';
import {
  countSection,
  hasJobsNavActivity,
  hasPaymentsNavActivity,
  hasRequestsNavActivity,
  jobIdsWithActivity,
  requestHasActivity,
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

  const { data: pendingRequestIds = new Set<string>() } = useQuery({
    queryKey: ['provider', 'pending-request-ids', user?.id],
    queryFn: async () => {
      const jobs = await getPendingRequestsForProvider(user!.id);
      return new Set(jobs.map((j) => j.id));
    },
    enabled: Boolean(user?.id && user?.role === 'provider'),
    staleTime: 10_000,
  });

  const refresh = useCallback(() => {
    if (!user?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
    if (user.role === 'provider') {
      void queryClient.invalidateQueries({ queryKey: ['provider', 'pending-request-ids', user.id] });
    }
  }, [queryClient, user?.id, user?.role]);

  const activeJobIds = useMemo(
    () => jobIdsWithActivity(notifications, pendingRequestIds),
    [notifications, pendingRequestIds]
  );

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
    pendingRequestIds,
    isLoading,
    hasJobsNavActivity: hasJobsNavActivity(notifications, pendingRequestIds),
    hasRequestsNavActivity: hasRequestsNavActivity(notifications, pendingRequestIds),
    hasPaymentsNavActivity: hasPaymentsNavActivity(notifications),
    activeJobIds,
    jobHasActivity: (jobId: string) => activeJobIds.has(jobId),
    requestHasActivity: (jobId: string) =>
      requestHasActivity(notifications, jobId, pendingRequestIds),
    unreadCountForJob: (jobId: string) => unreadForJob(notifications, jobId).length,
    messagesCount: (jobId: string) => countSection(notifications, jobId, 'messages'),
    materialsCount: (jobId: string) => countSection(notifications, jobId, 'materials'),
    generalCount: (jobId: string) => countSection(notifications, jobId, 'general'),
    markJobSectionRead,
    refresh,
  };
}
