import { useState, useMemo, useCallback, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  postSupportMessage,
  postAdminSupportReply,
} from '@/lib/api/notifications';
import { AppNotification, UserRole } from '@/types';
import {
  Bell,
  CheckCircle,
  XCircle,
  DollarSign,
  RefreshCw,
  MessageSquare,
  AlertCircle,
  Check,
  Truck,
  ClipboardList,
  Search,
  Tags,
  LifeBuoy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format, isToday, isYesterday, parseISO } from 'date-fns';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

function dateGroupLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

function navigateForNotification(n: AppNotification, role: UserRole, navigate: NavigateFunction): void {
  if (n.type === 'provider_approved') {
    navigate('/provider/profile');
    return;
  }
  if (n.type === 'category_suggestion') {
    navigate('/admin/categories');
    return;
  }
  if (n.type === 'support_contact') return;
  if (!n.jobId) return;
  if (role === 'user') navigate(`/user/jobs/${n.jobId}`);
  else if (role === 'provider') navigate(`/provider/jobs/${n.jobId}`);
  else if (role === 'admin') navigate(`/admin/jobs/${n.jobId}`);
}

function getNotificationIcon(type: AppNotification['type']) {
  switch (type) {
    case 'provider_accepted':
    case 'job_accepted':
    case 'job_completed':
      return <CheckCircle className="h-4 w-4 text-success" />;
    case 'provider_rejected':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'material_paid':
    case 'payment_made':
      return <DollarSign className="h-4 w-4 text-primary" />;
    case 'refund_issued':
      return <RefreshCw className="h-4 w-4 text-primary" />;
    case 'provider_suggestion':
    case 'material_suggestion_received':
      return <MessageSquare className="h-4 w-4 text-accent" />;
    case 'job_cancelled':
      return <AlertCircle className="h-4 w-4 text-warning" />;
    case 'job_request':
      return <ClipboardList className="h-4 w-4 text-primary" />;
    case 'inspection_completed':
      return <Search className="h-4 w-4 text-primary" />;
    case 'price_submitted':
      return <DollarSign className="h-4 w-4 text-amber-600" />;
    case 'delivery_update':
      return <Truck className="h-4 w-4 text-primary" />;
    case 'provider_approved':
      return <CheckCircle className="h-4 w-4 text-success" />;
    case 'category_suggestion':
      return <Tags className="h-4 w-4 text-accent" />;
    case 'support_contact':
      return <LifeBuoy className="h-4 w-4 text-muted-foreground" />;
    case 'job_chat':
      return <MessageSquare className="h-4 w-4 text-primary" />;
    case 'support_reply':
      return <LifeBuoy className="h-4 w-4 text-primary" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [supportText, setSupportText] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [adminReplyUserId, setAdminReplyUserId] = useState('');
  const [adminReplyText, setAdminReplyText] = useState('');
  const [adminReplySending, setAdminReplySending] = useState(false);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);

  const role = user?.role ?? 'user';

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list', user?.id],
    queryFn: () => getNotifications(user!.id),
    enabled: Boolean(user?.id),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const invalidateUnread = useCallback(() => {
    if (user?.id) {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
    }
  }, [queryClient, user?.id]);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!user) return;
    await markAsRead(user.id, notificationId);
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
    invalidateUnread();
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    await markAllAsRead(user.id);
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
    invalidateUnread();
  };

  const handleNotificationClick = (notification: AppNotification) => {
    void handleMarkAsRead(notification.id);
    navigateForNotification(notification, role, navigate);
  };

  const threadMap = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    for (const n of notifications) {
      const key =
        n.conversationId ||
        (n.senderId && n.jobId ? `legacy:${n.senderId}:${n.jobId}` : `single:${n.id}`);
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => parseISO(a.createdAt).getTime() - parseISO(b.createdAt).getTime());
    }
    return map;
  }, [notifications]);

  const threadKeys = useMemo(() => {
    const keys = [...threadMap.keys()];
    keys.sort((a, b) => {
      const msgsA = threadMap.get(a) ?? [];
      const msgsB = threadMap.get(b) ?? [];
      const tA = Math.max(...msgsA.map((m) => parseISO(m.createdAt).getTime()), 0);
      const tB = Math.max(...msgsB.map((m) => parseISO(m.createdAt).getTime()), 0);
      return tB - tA;
    });
    return keys;
  }, [threadMap]);

  useEffect(() => {
    if (threadKeys.length === 0) {
      setSelectedThreadKey(null);
      return;
    }
    if (selectedThreadKey == null || !threadKeys.includes(selectedThreadKey)) {
      setSelectedThreadKey(threadKeys[0]);
    }
  }, [threadKeys, selectedThreadKey]);

  const selectedThreadMessages = selectedThreadKey ? threadMap.get(selectedThreadKey) ?? [] : [];

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = adminReplyUserId.trim();
    const msg = adminReplyText.trim();
    if (uid.length < 1 || msg.length < 1 || msg.length > 2000) {
      toast({
        title: 'Invalid input',
        description: 'Enter a user id and message (1–2000 characters).',
        variant: 'destructive',
      });
      return;
    }
    setAdminReplySending(true);
    try {
      await postAdminSupportReply(uid, msg);
      setAdminReplyText('');
      toast({ title: 'Reply sent' });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user?.id] });
    } catch {
      toast({ title: 'Failed to send', variant: 'destructive' });
    } finally {
      setAdminReplySending(false);
    }
  };

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = supportText.trim();
    if (msg.length < 1 || msg.length > 2000) {
      toast({
        title: 'Invalid message',
        description: 'Enter between 1 and 2000 characters.',
        variant: 'destructive',
      });
      return;
    }
    setSupportSending(true);
    try {
      await postSupportMessage(msg);
      setSupportText('');
      toast({ title: 'Message sent', description: 'Support will review your message.' });
    } catch {
      toast({ title: 'Failed to send', description: 'Try again later.', variant: 'destructive' });
    } finally {
      setSupportSending(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Notifications</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                : 'All caught up!'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full shrink-0 whitespace-nowrap sm:w-auto"
              onClick={() => void handleMarkAllAsRead()}
            >
              <Check className="mr-2 h-4 w-4" />
              Mark All Read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="card-elevated p-8 text-center sm:p-12">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No notifications</h3>
            <p className="text-muted-foreground text-sm">You will see updates about your activity here</p>
          </div>
        ) : (
          <div className="grid min-h-[420px] gap-4 lg:grid-cols-12">
            <div className="flex flex-col overflow-hidden rounded-lg border border-border lg:col-span-4">
              <div className="border-b border-border px-3 py-2 text-sm font-medium text-muted-foreground">
                Threads / users
              </div>
              <ul className="max-h-[min(60vh,560px)] flex-1 overflow-y-auto">
                {threadKeys.map((key) => {
                  const msgs = threadMap.get(key) ?? [];
                  const last = msgs[msgs.length - 1];
                  const unreadInThread = msgs.some((m) => !m.read);
                  const label =
                    last?.senderName && last.jobId
                      ? `${last.senderName} · Job`
                      : last?.title ?? 'Notification';
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedThreadKey(key)}
                        className={cn(
                          'flex w-full flex-col gap-0.5 border-b border-border px-3 py-3 text-left text-sm transition-colors hover:bg-muted/60',
                          selectedThreadKey === key && 'bg-muted/80'
                        )}
                      >
                        <span className="line-clamp-1 font-medium">{label}</span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{last?.message}</span>
                        <span className="text-xs text-muted-foreground">
                          {last
                            ? formatDistanceToNow(parseISO(last.createdAt), { addSuffix: true })
                            : ''}
                          {unreadInThread && (
                            <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex flex-col overflow-hidden rounded-lg border border-border lg:col-span-8">
              <div className="border-b border-border px-4 py-2 text-sm font-medium text-muted-foreground">
                Messages
              </div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 max-h-[min(60vh,560px)]">
                {selectedThreadMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Select a thread</p>
                ) : (
                  selectedThreadMessages.map((notification) => (
                    <div
                      key={notification.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotificationClick(notification)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          handleNotificationClick(notification);
                        }
                      }}
                      className={cn(
                        'rounded-lg border border-border p-3 transition-colors cursor-pointer',
                        !notification.read && 'border-primary/25 bg-primary/5',
                        'hover:border-primary/30'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'h-9 w-9 flex shrink-0 items-center justify-center rounded-full',
                            !notification.read ? 'bg-primary/10' : 'bg-muted'
                          )}
                        >
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn('font-medium', !notification.read && 'text-primary')}>
                            {notification.title}
                          </p>
                          {notification.senderName && (
                            <p className="text-xs text-muted-foreground">
                              {notification.senderName}
                              {notification.senderRole ? ` · ${notification.senderRole}` : ''}
                            </p>
                          )}
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {notification.message}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {dateGroupLabel(notification.createdAt)} ·{' '}
                            {formatDistanceToNow(parseISO(notification.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {role === 'admin' && (
          <div className="card-elevated p-6 space-y-4 border border-border">
            <h2 className="font-semibold">Reply as support</h2>
            <p className="text-sm text-muted-foreground">
              Sends an in-app notification to the user&apos;s account (test endpoint from UI).
            </p>
            <form onSubmit={(e) => void handleAdminReply(e)} className="space-y-3">
              <div>
                <label className="text-sm font-medium" htmlFor="admin-reply-user">
                  User id
                </label>
                <Input
                  id="admin-reply-user"
                  value={adminReplyUserId}
                  onChange={(e) => setAdminReplyUserId(e.target.value)}
                  placeholder="Customer or provider user UUID"
                  className="mt-1"
                />
              </div>
              <Textarea
                value={adminReplyText}
                onChange={(e) => setAdminReplyText(e.target.value)}
                placeholder="Support reply…"
                rows={3}
                maxLength={2000}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={adminReplySending}>
                  {adminReplySending ? 'Sending…' : 'Send reply'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {role !== 'admin' && (
          <div className="card-elevated p-6 space-y-4 border border-border">
            <div className="flex items-start gap-3">
              <LifeBuoy className="h-5 w-5 shrink-0 text-primary mt-0.5" />
              <div>
                <h2 className="font-semibold">Contact support</h2>
                <p className="text-sm text-muted-foreground">
                  Send a message to the admin team. We will review it as soon as we can.
                </p>
              </div>
            </div>
            <form onSubmit={(e) => void handleSupportSubmit(e)} className="space-y-3">
              <Textarea
                value={supportText}
                onChange={(e) => setSupportText(e.target.value)}
                placeholder="Describe your issue or question…"
                rows={4}
                maxLength={2000}
                className="resize-y min-h-[100px]"
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={supportSending || supportText.trim().length < 1}>
                  {supportSending ? 'Sending…' : 'Send message'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
