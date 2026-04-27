import { ReactNode, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useProviderStatus } from '@/hooks/useProviderStatus';
import { Button } from '@/components/ui/button';
import { EloFixLogo } from '@/components/EloFixLogo';
import { getUnreadCount } from '@/lib/api/notifications';
import { socket } from '@/lib/socket';
import { 
  LayoutDashboard, 
  FileText, 
  Briefcase, 
  CreditCard, 
  User, 
  Users,
  Package,
  Tags,
  LogOut,
  Menu,
  X,
  ChevronRight,
  DollarSign,
  ClipboardList,
  ShoppingCart,
  AlertCircle,
  Bell,
  Activity,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const userNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/user/dashboard', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { label: 'New Request', path: '/user/new-request', icon: <FileText className="h-4 w-4 shrink-0" /> },
  { label: 'My Jobs', path: '/user/jobs', icon: <Briefcase className="h-4 w-4 shrink-0" /> },
  { label: 'Material Orders', path: '/user/material-orders', icon: <ShoppingCart className="h-4 w-4 shrink-0" /> },
  { label: 'Payments', path: '/user/payments', icon: <CreditCard className="h-4 w-4 shrink-0" /> },
];

const providerNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/provider/dashboard', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { label: 'Requests', path: '/provider/requests', icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
  { label: 'Active Jobs', path: '/provider/jobs', icon: <Briefcase className="h-4 w-4 shrink-0" /> },
  { label: 'Earnings', path: '/provider/earnings', icon: <DollarSign className="h-4 w-4 shrink-0" /> },
];

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { label: 'Analytics', path: '/admin/analytics', icon: <Activity className="h-4 w-4 shrink-0" /> },
  { label: 'Providers', path: '/admin/providers', icon: <Users className="h-4 w-4 shrink-0" /> },
  { label: 'Suppliers', path: '/admin/suppliers', icon: <Package className="h-4 w-4 shrink-0" /> },
  { label: 'Categories', path: '/admin/categories', icon: <Tags className="h-4 w-4 shrink-0" /> },
  { label: 'Jobs', path: '/admin/jobs', icon: <Briefcase className="h-4 w-4 shrink-0" /> },
  { label: 'Payments', path: '/admin/payments', icon: <CreditCard className="h-4 w-4 shrink-0" /> },
  { label: 'Withdrawals', path: '/admin/withdrawals', icon: <Wallet className="h-4 w-4 shrink-0" /> },
];

function notificationsPathForRole(role: string | undefined): string {
  switch (role) {
    case 'admin':
      return '/admin/notifications';
    case 'provider':
      return '/provider/notifications';
    default:
      return '/user/notifications';
  }
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();
  const { isActiveProvider, isApproved, isProfileComplete } = useProviderStatus();

  const notificationsHref = useMemo(() => notificationsPathForRole(user?.role), [user?.role]);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count', user?.id],
    queryFn: () => getUnreadCount(),
    enabled: Boolean(user?.id),
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!user?.id) return;

    const refreshUnread = () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
    };

    socket.on('notification:new', refreshUnread);
    socket.on('message:new', refreshUnread);
    socket.on('notification:read', refreshUnread);
    socket.on('notification:read-all', refreshUnread);

    return () => {
      socket.off('notification:new', refreshUnread);
      socket.off('message:new', refreshUnread);
      socket.off('notification:read', refreshUnread);
      socket.off('notification:read-all', refreshUnread);
    };
  }, [queryClient, user?.id]);

  const showInactiveProviderOverlay =
    user?.role === 'provider' &&
    location.pathname !== '/provider/profile' &&
    !isActiveProvider;

  const getNavItems = (): NavItem[] => {
    switch (user?.role) {
      case 'admin': return adminNavItems;
      case 'provider': return providerNavItems;
      default: return userNavItems;
    }
  };

  const navItems = getNavItems();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'admin': return 'Administrator';
      case 'provider': return 'Service Provider';
      default: return 'Customer';
    }
  };

  return (
    <div className="min-h-screen max-w-full bg-secondary-foreground/25">
      {/* Mobile Header — shrink-0 so flex stretch doesn’t steal height; sticky needs no overflow:hidden on ancestors (overflow is on main only) */}
      <header className="sticky top-0 z-50 flex h-16 min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4 lg:hidden">
        <div className="min-w-0 shrink">
          <EloFixLogo variant="dark" className="h-12 sm:h-16" />
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}>
          {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </header>

      <div className="flex min-w-0 max-w-full">
        {/* Sidebar — self-start fixes flex stretch: without it, aside grows to main height and sticky does nothing */}
        <aside className={cn(
          "relative z-40 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card transition-transform duration-200",
          "sticky top-0 self-start",
          "max-lg:fixed max-lg:left-0 max-lg:top-0",
          sidebarOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
          "lg:translate-x-0",
        )}>
          {/* Sidebar Header - Desktop only */}
          <div className="hidden h-16 shrink-0 items-center justify-center gap-2 border-b border-border px-6 lg:flex">
            <EloFixLogo variant="dark" className="h-16" />
          </div>

          {/* User Info — customer/provider: link to profile */}
          <div className="mt-16 shrink-0 border-b border-border p-4 lg:mt-0">
            {user?.role === 'user' || user?.role === 'provider' ? (
              <Link
                to={user.role === 'provider' ? '/provider/profile' : '/user/profile'}
                onClick={() => setSidebarOpen(false)}
                className="flex min-w-0 items-center gap-3 rounded-md p-1 -m-1 transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate font-medium text-sm">{user?.name}</p>
                    {user.role === 'provider' && (!isProfileComplete || !isApproved) && (
                      <AlertCircle
                        className="h-4 w-4 shrink-0 text-amber-600"
                        aria-label="Profile needs attention"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{getRoleLabel()}</p>
                </div>
              </Link>
            ) : (
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{getRoleLabel()}</p>
                </div>
              </div>
            )}
          </div>

          {/* Navigation — scrolls if many items; logout stays at bottom */}
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "nav-link",
                  location.pathname === item.path && "active"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
                {location.pathname === item.path && (
                  <ChevronRight className="ml-auto h-4 w-4" />
                )}
              </Link>
            ))}
          </nav>

          {/* Bell + Logout */}
          <div className="shrink-0 border-t border-border p-4">
            <div className="flex items-center gap-2">
              <Link
                to={notificationsHref}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted',
                  location.pathname === notificationsHref && 'border-primary/50 bg-primary/5'
                )}
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="nav-link min-w-0 flex-1 text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="min-h-screen min-w-0 flex-1 overflow-x-hidden lg:min-h-[calc(100vh-4rem)]">
          <div className="relative space-y-6 p-4 md:space-y-8 lg:p-8">
            {showInactiveProviderOverlay ? (
              <div className="relative min-h-[50vh]">
                <div className="pointer-events-none select-none opacity-[0.38]">{children}</div>
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-background/75 backdrop-blur-[2px]">
                  <div className="card-elevated max-w-md w-full border border-border bg-card p-6 shadow-lg text-center space-y-4">
                    <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" aria-hidden />
                    <div>
                      <p className="font-semibold text-lg">Complete your profile and get approved</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Complete your profile and get approved to access this feature. You can still move around the app — open your profile to finish setup.
                      </p>
                    </div>
                    <Button asChild className="w-full sm:w-auto">
                      <Link to="/provider/profile" onClick={() => setSidebarOpen(false)}>
                        Go to Profile
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
