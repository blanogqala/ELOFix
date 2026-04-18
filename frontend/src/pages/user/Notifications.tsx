import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { getNotifications, markAsRead, markAllAsRead } from '@/lib/api/notifications';
import { AppNotification } from '@/types';
import { 
  Bell, 
  CheckCircle, 
  XCircle, 
  DollarSign, 
  RefreshCw,
  MessageSquare,
  AlertCircle,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getNotifications(user.id);
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadNotifications();
    }
  }, [user, loadNotifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!user) return;
    await markAsRead(user.id, notificationId);
    setNotifications((prev) => prev.map((n) =>
      n.id === notificationId ? { ...n, read: true } : n
    ));
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    await markAllAsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleNotificationClick = (notification: AppNotification) => {
    handleMarkAsRead(notification.id);
    if (notification.jobId) {
      navigate(`/user/jobs/${notification.jobId}`);
    }
  };

  const getNotificationIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'provider_accepted': return <CheckCircle className="h-5 w-5 text-success" />;
      case 'provider_rejected': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'material_paid': return <DollarSign className="h-5 w-5 text-primary" />;
      case 'job_completed': return <CheckCircle className="h-5 w-5 text-success" />;
      case 'refund_issued': return <RefreshCw className="h-5 w-5 text-primary" />;
      case 'provider_suggestion': return <MessageSquare className="h-5 w-5 text-accent" />;
      case 'job_cancelled': return <AlertCircle className="h-5 w-5 text-warning" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllAsRead}>
              <Check className="mr-2 h-4 w-4" />
              Mark All Read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="card-elevated p-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No notifications</h3>
            <p className="text-muted-foreground text-sm">You'll see updates about your jobs here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(notification => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={cn(
                  "card-elevated p-4 cursor-pointer transition-colors",
                  !notification.read && "bg-primary/5 border-primary/20",
                  "hover:border-primary/30"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                    !notification.read ? "bg-primary/10" : "bg-muted"
                  )}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium", !notification.read && "text-primary")}>
                      {notification.title}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(parseISO(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {!notification.read && (
                    <div className="h-2 w-2 rounded-full bg-accent shrink-0 mt-2" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
