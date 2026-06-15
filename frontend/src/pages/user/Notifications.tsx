import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ApiHttpError } from '@/api/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  ArrowLeft,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatPersonDisplayName,
  sanitizeNotificationMessage,
} from '@/lib/displayPersonName';
import { formatDistanceToNow, format, isToday, isYesterday, parseISO } from 'date-fns';
import { useNavigate, useLocation, type NavigateFunction } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { socket } from '@/lib/socket';

function dateGroupLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

function isSupportType(type: AppNotification['type']): boolean {
  return type === 'support_contact' || type === 'support_reply';
}

function getThreadKey(
  n: AppNotification,
  ctx: { role: UserRole; currentUserId: string }
): string {
  const mat = n.materialOrderId?.trim();
  if (mat) {
    return `material:${mat}`;
  }
  if (n.jobId) {
    return `job:${n.jobId}`;
  }
  if (isSupportType(n.type)) {
    if (ctx.role === 'admin') {
      if (n.branchUserId) {
        return `support:branch:${n.branchUserId}`;
      }
      if (
        n.type === 'support_reply' &&
        n.senderId === ctx.currentUserId &&
        n.supportTargetUserId
      ) {
        return `support:${n.supportTargetUserId}`;
      }
      if (n.senderId) {
        return `support:${n.senderId}`;
      }
      return `general:${n.id}`;
    }
    return `support:${ctx.currentUserId}`;
  }
  return `general:${n.senderId || n.id}`;
}

/** Best-effort job name from copy used by backend (quoted strings in message). */
function extractJobContextLabel(msgs: AppNotification[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i].message;
    const quoted = m.match(/["""']([^"']+)[""']/);
    if (quoted && quoted[1] && quoted[1].length > 0 && quoted[1].length < 120) {
      return quoted[1].trim();
    }
    const forJob = m.match(/for (?:“|"|')([^"'\n]+)(?:”|"|')/i);
    if (forJob && forJob[1]) return forJob[1].trim();
  }
  const last = msgs[msgs.length - 1];
  return last?.title ?? 'Job activity';
}

function formatDisplayRole(r?: string): string {
  if (!r) return '';
  const x = r.toLowerCase();
  if (x === 'customer') return 'user';
  if (x === 'branch_staff') return 'branch staff';
  if (x === 'provider' || x === 'user' || x === 'admin' || x === 'supplier') return x;
  return r;
}

function initialFromName(name: string): string {
  const t = formatPersonDisplayName(name, '').trim();
  if (!t) return '?';
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + (parts[1]![0]! || '')).toUpperCase();
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
  if (n.type === 'support_contact' || n.type === 'support_reply') return;
  const mat = n.materialOrderId?.trim();
  if ((role === 'supplier' || role === 'branch_staff') && mat) {
    navigate(`/supplier/orders?orderId=${encodeURIComponent(mat)}`);
    return;
  }
  if (role === 'user' && mat) {
    navigate(`/user/material-orders/${encodeURIComponent(mat)}`);
    return;
  }
  if (!n.jobId) return;
  const tab =
    n.type === 'job_chat' ? '?tab=messages' : '';
  if (role === 'user') navigate(`/user/jobs/${n.jobId}${tab}`);
  else if (role === 'provider') navigate(`/provider/jobs/${n.jobId}${tab}`);
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
    case 'material_list_submitted':
      return <ClipboardList className="h-4 w-4 text-orange-500" />;
    case 'support_reply':
      return <LifeBuoy className="h-4 w-4 text-primary" />;
    case 'supplier_material_order_new':
    case 'material_order_new':
      return <ClipboardList className="h-4 w-4 text-primary" />;
    case 'supplier_material_order_cancelled':
    case 'material_order_cancelled':
      return <AlertCircle className="h-4 w-4 text-warning" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
}

const PANEL_H = 'min-h-[min(70vh,560px)] max-h-[min(70vh,640px)]';

function parseKey(key: string): { kind: 'job' | 'support' | 'general' | 'material' } {
  if (key.startsWith('job:')) return { kind: 'job' };
  if (key.startsWith('support:branch:') || key.startsWith('support:')) return { kind: 'support' };
  if (key.startsWith('material:')) return { kind: 'material' };
  return { kind: 'general' };
}

interface SupportReplyTarget {
  userId?: string;
  branchUserId?: string;
}

function parseSupportReplyTarget(
  threadKey: string | null,
  messages: AppNotification[]
): SupportReplyTarget | null {
  if (!threadKey) return null;
  if (threadKey.startsWith('support:branch:')) {
    const branchUserId = threadKey.slice('support:branch:'.length).trim();
    return branchUserId ? { branchUserId } : null;
  }
  if (threadKey.startsWith('support:')) {
    const userId = threadKey.slice('support:'.length).trim();
    return userId ? { userId } : null;
  }
  if (threadKey.startsWith('general:')) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const branchUserId = messages[i]?.branchUserId?.trim();
      if (branchUserId) return { branchUserId };
    }
  }
  return null;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiHttpError) return err.message || fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [supportText, setSupportText] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [adminReplySending, setAdminReplySending] = useState(false);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [mobileMessageView, setMobileMessageView] = useState(false);
  const messageScrollRef = useRef<HTMLDivElement>(null);

  const role = user?.role ?? 'user';
  const supportKey = user?.id ? `support:${user.id}` : null;

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list', user?.id],
    queryFn: () => getNotifications(),
    enabled: Boolean(user?.id),
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const invalidateUnread = useCallback(() => {
    if (user?.id) {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
    }
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const refreshNotifications = () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
    };

    socket.on('notification:new', refreshNotifications);
    socket.on('message:new', refreshNotifications);
    socket.on('notification:read', refreshNotifications);
    socket.on('notification:read-all', refreshNotifications);

    return () => {
      socket.off('notification:new', refreshNotifications);
      socket.off('message:new', refreshNotifications);
      socket.off('notification:read', refreshNotifications);
      socket.off('notification:read-all', refreshNotifications);
    };
  }, [queryClient, user?.id]);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!user) return;
    await markAsRead(notificationId);
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
    invalidateUnread();
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    await markAllAsRead();
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
    invalidateUnread();
  };

  const handleNotificationClick = (notification: AppNotification) => {
    void handleMarkAsRead(notification.id);
    navigateForNotification(notification, role, navigate);
  };

  const threadMap = useMemo(() => {
    if (!user?.id) {
      return new Map<string, AppNotification[]>();
    }
    const ctx = { role, currentUserId: user.id };
    const map = new Map<string, AppNotification[]>();
    for (const n of notifications) {
      const key = getThreadKey(n, ctx);
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => parseISO(a.createdAt).getTime() - parseISO(b.createdAt).getTime());
    }
    return map;
  }, [notifications, user?.id, role]);

  const displayThreadKeys = useMemo(() => {
    const keys = new Set<string>(threadMap.keys());
    if (
      supportKey &&
      (role === 'user' ||
        role === 'provider' ||
        role === 'supplier' ||
        role === 'branch_staff')
    ) {
      keys.add(supportKey);
    }
    const out = [...keys];
    out.sort((a, b) => {
      const msgsA = threadMap.get(a) ?? [];
      const msgsB = threadMap.get(b) ?? [];
      const tA = Math.max(0, ...msgsA.map((m) => parseISO(m.createdAt).getTime()));
      const tB = Math.max(0, ...msgsB.map((m) => parseISO(m.createdAt).getTime()));
      return tB - tA;
    });
    return out;
  }, [threadMap, role, supportKey]);

  useEffect(() => {
    if (displayThreadKeys.length === 0) {
      setSelectedThreadKey(null);
      return;
    }
    if (selectedThreadKey == null || !displayThreadKeys.includes(selectedThreadKey)) {
      setSelectedThreadKey(displayThreadKeys[0]!);
    }
  }, [displayThreadKeys, selectedThreadKey]);

  /** Open support composer when navigated from FAB (state or ?support=1). */
  useEffect(() => {
    if (!supportKey || !user?.id) return;
    const state = location.state as { openSupport?: boolean } | undefined;
    const params = new URLSearchParams(location.search);
    const wantsOpen = Boolean(state?.openSupport) || params.get('support') === '1';
    if (!wantsOpen) return;
    setSelectedThreadKey(supportKey);
    if (isMobile) setMobileMessageView(true);
    params.delete('support');
    const qs = params.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ''}`, { replace: true, state: {} });
  }, [location.pathname, location.search, location.state, supportKey, navigate, isMobile, user?.id]);

  const selectedThreadMessages = selectedThreadKey
    ? threadMap.get(selectedThreadKey) ?? (selectedThreadKey === supportKey ? [] : [])
    : [];

  const adminReplyTarget = useMemo(
    () =>
      role === 'admin' && selectedThreadKey
        ? parseSupportReplyTarget(selectedThreadKey, selectedThreadMessages)
        : null,
    [role, selectedThreadKey, selectedThreadMessages]
  );

  useLayoutEffect(() => {
    const el = messageScrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [selectedThreadKey, selectedThreadMessages.length, notifications.length, mobileMessageView]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = adminReplyText.trim();
    if (!adminReplyTarget || msg.length < 1 || msg.length > 2000) {
      toast({
        title: 'Invalid input',
        description: adminReplyTarget
          ? 'Enter a message (1–2000 characters).'
          : 'Select a support conversation to reply.',
        variant: 'destructive',
      });
      return;
    }
    setAdminReplySending(true);
    try {
      await postAdminSupportReply(msg, adminReplyTarget);
      setAdminReplyText('');
      toast({ title: 'Reply sent' });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user?.id] });
    } catch (err) {
      toast({
        title: 'Failed to send',
        description: apiErrorMessage(err, 'Try again later.'),
        variant: 'destructive',
      });
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
      if (user?.id) {
        void queryClient.invalidateQueries({ queryKey: ['notifications', 'list', user.id] });
      }
    } catch (err) {
      toast({
        title: 'Failed to send',
        description: apiErrorMessage(err, 'Try again later.'),
        variant: 'destructive',
      });
    } finally {
      setSupportSending(false);
    }
  };

  const getThreadListRowMeta = (key: string) => {
    const msgs = threadMap.get(key) ?? [];
    const last = msgs[msgs.length - 1];
    const { kind } = parseKey(key);

    if (kind === 'support' && (role === 'user' || role === 'provider' || role === 'supplier' || role === 'branch_staff')) {
      return {
        primary: 'Support',
        secondary: '' as string | undefined,
        tertiary: last?.senderRole ? formatDisplayRole(last.senderRole) : '',
        avatarLabel: 'S',
        preview: last?.message ?? 'Start a conversation with support',
        time: last ? parseISO(last.createdAt) : null,
      };
    }

    if (kind === 'support' && role === 'admin') {
      if (key.startsWith('support:branch:')) {
        return {
          primary: 'Branch staff',
          secondary: 'Support request',
          tertiary: last?.senderRole ? formatDisplayRole(last.senderRole) : 'branch staff',
          avatarLabel: 'B',
          preview: last?.message ? sanitizeNotificationMessage(last.message) : '',
          time: last ? parseISO(last.createdAt) : null,
        };
      }
      return {
        primary: formatPersonDisplayName(last?.senderName, 'Support'),
        secondary: 'Support request',
        tertiary: last?.senderRole ? formatDisplayRole(last.senderRole) : 'user',
        avatarLabel: initialFromName(last?.senderName ?? 'U'),
        preview: last?.message ? sanitizeNotificationMessage(last.message) : '',
        time: last ? parseISO(last.createdAt) : null,
      };
    }

    if (kind === 'job' && last) {
      const jobLabel = extractJobContextLabel(msgs);
      return {
        primary: formatPersonDisplayName(last.senderName, 'Update'),
        secondary: jobLabel,
        tertiary: last.senderRole ? formatDisplayRole(last.senderRole) : '',
        avatarLabel: initialFromName(last.senderName ?? 'J'),
        preview: sanitizeNotificationMessage(last.message),
        time: parseISO(last.createdAt),
      };
    }

    if (kind === 'material' && last) {
      return {
        primary: last.title || 'Order activity',
        secondary: undefined as string | undefined,
        tertiary: '',
        avatarLabel: 'O',
        preview: sanitizeNotificationMessage(last.message),
        time: parseISO(last.createdAt),
      };
    }

    if (last) {
      return {
        primary: formatPersonDisplayName(last.senderName ?? last.title, last.title),
        secondary: undefined as string | undefined,
        tertiary: last.senderRole ? formatDisplayRole(last.senderRole) : '',
        avatarLabel: initialFromName((last.senderName ?? last.title).trim() || 'N'),
        preview: sanitizeNotificationMessage(last.message),
        time: parseISO(last.createdAt),
      };
    }

    return {
      primary: 'Thread',
      secondary: undefined as string | undefined,
      tertiary: '',
      avatarLabel: '?',
      preview: 'Start a conversation with support',
      time: null as Date | null,
    };
  };

  const openSupport = () => {
    if (supportKey) {
      setSelectedThreadKey(supportKey);
      if (isMobile) setMobileMessageView(true);
    }
  };

  const selectThread = (key: string) => {
    setSelectedThreadKey(key);
    if (isMobile) setMobileMessageView(true);
  };

  const mobileBack = () => {
    setMobileMessageView(false);
  };

  const showSupportInput =
    supportKey && selectedThreadKey === supportKey && role !== 'admin';

  const showAdminSupportInput = role === 'admin' && adminReplyTarget != null;

  const isSupportUserThreadEmpty =
    (role === 'user' || role === 'provider' || role === 'supplier' || role === 'branch_staff') &&
    supportKey &&
    selectedThreadKey === supportKey &&
    (threadMap.get(supportKey) ?? []).length === 0;

  const renderMessageBubbles = () => {
    if (!selectedThreadKey) {
      return <p className="text-sm text-muted-foreground text-center py-8">Select a thread</p>;
    }

    if (isSupportUserThreadEmpty) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center py-10 px-4 text-center text-muted-foreground text-sm">
          <LifeBuoy className="h-10 w-10 mb-3 opacity-50" />
          <p>Start a conversation with support</p>
        </div>
      );
    }

    if (selectedThreadMessages.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-8">No messages in this thread</p>;
    }

    let lastGroup = '';
    return (
      <div className="flex flex-col gap-3 p-2 sm:p-4">
        {selectedThreadMessages.map((notification) => {
          const dLabel = dateGroupLabel(notification.createdAt);
          const showDate = dLabel !== lastGroup;
          if (showDate) lastGroup = dLabel;
          const isMe = user?.id && notification.senderId === user.id;
          return (
            <div key={notification.id}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/80 px-3 py-1 rounded-full">
                    {dLabel}
                  </span>
                </div>
              )}
              <div
                className={cn('flex w-full', isMe ? 'justify-end' : 'justify-start')}
                role="button"
                tabIndex={0}
                onClick={() => handleNotificationClick(notification)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    handleNotificationClick(notification);
                  }
                }}
              >
                <div
                  className={cn(
                    'max-w-[min(100%,20rem)] rounded-xl px-3 py-2.5 transition-colors cursor-pointer shadow-sm',
                    isMe
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-card border border-border/80 text-foreground rounded-bl-md',
                    !notification.read && !isMe && 'ring-1 ring-primary/20'
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {!isMe && (
                      <span className="shrink-0 text-muted-foreground">
                        {getNotificationIcon(notification.type)}
                      </span>
                    )}
                    <span
                      className={cn(
                        'text-xs font-medium line-clamp-1',
                        isMe ? 'text-primary-foreground/90' : 'text-foreground'
                      )}
                    >
                      {notification.title}
                    </span>
                  </div>
                  {!isMe && notification.senderName && (
                    <p className="text-[10px] opacity-80 mb-1">
                      {formatPersonDisplayName(notification.senderName)}
                      {notification.senderRole ? ` · ${formatDisplayRole(notification.senderRole)}` : ''}
                    </p>
                  )}
                  <p
                    className={cn(
                      'whitespace-pre-wrap text-sm',
                      isMe ? 'text-primary-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {sanitizeNotificationMessage(notification.message)}
                  </p>
                  <p
                    className={cn(
                      'text-[10px] mt-1.5',
                      isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}
                  >
                    {formatDistanceToNow(parseISO(notification.createdAt), { addSuffix: true })}
                    {!notification.read && (
                      <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle bg-accent" />
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMessagePanel = (opts: { withBack: boolean; className?: string }) => {
    const { withBack, className } = opts;
    return (
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-lg border-2 border-primary bg-muted/40 transition-colors bg-muted',
          PANEL_H,
          className
        )}
      >
        <div className="border-b-2 border-primary/20 px-3 sm:px-4 py-2.5 flex items-center gap-2 shrink-0 min-h-[48px]">
          {withBack && isMobile && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9 -ml-1"
              onClick={mobileBack}
              aria-label="Back to threads"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-foreground line-clamp-1">
              {selectedThreadKey ? (() => {
                const m = getThreadListRowMeta(selectedThreadKey);
                return m.secondary ? `${m.primary} · ${m.secondary}` : m.primary;
              })() : 'Messages'}
            </h2>
          </div>
        </div>
        <div
          ref={messageScrollRef}
          className="flex-1 overflow-y-auto min-h-0"
        >
          {renderMessageBubbles()}
        </div>
        {showSupportInput && (
          <form
            onSubmit={(e) => void handleSupportSubmit(e)}
            className="border-t border-border/80 p-3 bg-background/80 backdrop-blur-sm shrink-0"
          >
            <div className="flex gap-2 items-end">
              <Textarea
                value={supportText}
                onChange={(e) => setSupportText(e.target.value)}
                placeholder="Message support…"
                rows={2}
                maxLength={2000}
                className="resize-none min-h-[72px] flex-1 rounded-xl"
              />
              <Button
                type="submit"
                size="icon"
                className="h-10 w-10 rounded-full shrink-0"
                disabled={supportSending || supportText.trim().length < 1}
                aria-label="Send"
              >
                {supportSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        )}
        {showAdminSupportInput && (
          <form
            onSubmit={(e) => void handleAdminReply(e)}
            className="border-t border-border/80 p-3 bg-background/80 backdrop-blur-sm shrink-0"
          >
            <div className="flex gap-2 items-end">
              <Textarea
                value={adminReplyText}
                onChange={(e) => setAdminReplyText(e.target.value)}
                placeholder="Reply as support…"
                rows={2}
                maxLength={2000}
                className="resize-none min-h-[72px] flex-1 rounded-xl"
              />
              <Button
                type="submit"
                size="icon"
                className="h-10 w-10 rounded-full shrink-0"
                disabled={adminReplySending || adminReplyText.trim().length < 1}
                aria-label="Send reply"
              >
                {adminReplySending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  };

  const renderThreadList = (opts: { className?: string; emptyHint?: string }) => {
    const { className, emptyHint } = opts;
    return (
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-lg border-2 border-primary bg-muted/30 transition-colors bg-muted',
          PANEL_H,
          className
        )}
      >
        <div className="border-b-2 border-primary/20 px-3 py-2.5 text-sm font-medium text-muted-foreground">
          Conversations
        </div>
        <ul className="flex-1 overflow-y-auto min-h-0">
          {displayThreadKeys.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {emptyHint ?? 'No threads yet.'}
            </li>
          )}
          {displayThreadKeys.map((key) => {
            const msgs = threadMap.get(key) ?? [];
            const unreadInThread = msgs.some((m) => !m.read);
            const meta = getThreadListRowMeta(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => selectThread(key)}
                  className={cn(
                    'flex w-full gap-3 text-left items-start border-b border-primary/60 px-4 py-3 transition-all duration-200',
                    'hover:bg-accent/50 active:bg-accent/70',
                    selectedThreadKey === key && 'bg-accent/60 border-l-4 border-l-primary pl-3'
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-11 w-11 ring-2 ring-background">
                      <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                        {meta.avatarLabel}
                      </AvatarFallback>
                    </Avatar>
                    {unreadInThread && (
                      <span
                        className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-background"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="line-clamp-1 font-medium text-foreground text-sm">
                        {meta.primary}
                      </span>
                      {meta.time && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                          {formatDistanceToNow(meta.time, { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    {meta.secondary ? (
                      <span className="line-clamp-1 text-xs text-primary/80">{meta.secondary}</span>
                    ) : null}
                    {meta.tertiary ? (
                      <span className="line-clamp-1 text-[10px] text-muted-foreground capitalize">
                        {meta.tertiary}
                      </span>
                    ) : null}
                    <span className="line-clamp-2 text-xs text-muted-foreground mt-0.5">
                      {key === supportKey && msgs.length === 0 ? 'Tap to start with support' : meta.preview}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
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

  const headerBlock = (
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
  );

  const showFloatSupport =
    role !== 'admin' &&
    (role === 'user' ||
      role === 'provider' ||
      role === 'supplier' ||
      role === 'branch_staff') &&
    supportKey;

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in relative pb-20 md:pb-0">
        {headerBlock}

        {isMobile ? (
          !mobileMessageView ? (
            renderThreadList({
              className: 'w-full',
              emptyHint:
                notifications.length === 0
                  ? 'No notifications yet. Use the support button to reach us.'
                  : 'No threads yet.',
            })
          ) : (
            renderMessagePanel({ withBack: true, className: 'w-full' })
          )
        ) : (
          <div className="grid min-h-0 gap-4 lg:grid-cols-12">
            {renderThreadList({ className: 'lg:col-span-4' })}
            {renderMessagePanel({ withBack: false, className: 'lg:col-span-8' })}
          </div>
        )}

        {showFloatSupport && (
          <button
            type="button"
            onClick={openSupport}
            className={cn(
              'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full',
              'bg-primary text-primary-foreground shadow-lg',
              'hover:scale-105 active:scale-95 transition-transform duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
            aria-label="Open support conversation"
          >
            <LifeBuoy className="h-6 w-6" />
          </button>
        )}

      </div>
    </DashboardLayout>
  );
}
