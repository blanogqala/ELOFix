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

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  const { data } = await apiClient.get<NotificationsResponse>('/notifications', { params: { userId } });
  return Array.isArray(data?.notifications) ? data.notifications : [];
}

export async function addNotification(notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): Promise<AppNotification> {
  const { data } = await apiClient.post<NotificationResponse>('/notifications', notification);
  if (!data?.notification) throw new Error('Failed to add notification');
  return data.notification;
}

export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  await apiClient.patch(`/notifications/${notificationId}/read`, { userId });
}

export async function markAllAsRead(userId: string): Promise<void> {
  await apiClient.patch('/notifications/read-all', { userId });
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { data } = await apiClient.get<CountResponse>('/notifications/unread-count', {
    params: { userId },
  });
  return typeof data?.count === 'number' ? data.count : 0;
}

export async function postSupportMessage(message: string): Promise<void> {
  await apiClient.post('/notifications/support', { message });
}
