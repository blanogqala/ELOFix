import { AppNotification } from '@/types';
import apiClient from '@/api/client';

interface NotificationsResponse {
  success: boolean;
  notifications: AppNotification[];
}

interface NotificationResponse {
  success: boolean;
  notification: AppNotification;
}

interface CountResponse {
  success: boolean;
  count: number;
}

export async function getNotifications(): Promise<AppNotification[]> {
  const { data } = await apiClient.get<NotificationsResponse>('/notifications');
  return Array.isArray(data?.notifications) ? data.notifications : [];
}

export async function addNotification(notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): Promise<AppNotification> {
  const { data } = await apiClient.post<NotificationResponse>('/notifications', notification);
  if (!data?.notification) throw new Error('Failed to add notification');
  return data.notification;
}

export async function markAsRead(notificationId: string): Promise<void> {
  await apiClient.patch(`/notifications/${notificationId}/read`);
}

export async function markAllAsRead(): Promise<void> {
  await apiClient.patch('/notifications/read-all');
}

export type JobNotificationSection = 'all' | 'materials' | 'messages' | 'general';

export async function markJobNotificationsRead(
  jobId: string,
  section: JobNotificationSection = 'all'
): Promise<void> {
  await apiClient.patch(`/notifications/job/${jobId}/read`, { section });
}

export async function markNavNotificationsRead(navPath: string): Promise<number> {
  const { data } = await apiClient.patch<{ success: boolean; count: number }>(
    '/notifications/nav/read',
    { navPath }
  );
  return typeof data?.count === 'number' ? data.count : 0;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<CountResponse>('/notifications/unread-count');
  return typeof data?.count === 'number' ? data.count : 0;
}

export async function postSupportMessage(message: string): Promise<void> {
  await apiClient.post('/notifications/support', { message });
}

/** Admin: send a support reply to a user or branch staff member. */
export async function postAdminSupportReply(
  message: string,
  target: { userId?: string; branchUserId?: string }
): Promise<void> {
  await apiClient.post('/notifications/support/reply', {
    message,
    userId: target.userId ?? '',
    ...(target.branchUserId ? { branchUserId: target.branchUserId } : {}),
  });
}
