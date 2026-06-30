import { ReactNode, useMemo, useState, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useProviderStatus } from '@/hooks/useProviderStatus';
import { Button } from '@/components/ui/button';
import { EloFixLogo } from '@/components/EloFixLogo';
import { getUnreadCount } from '@/lib/api/notifications';
import { useJobActivityIndicators } from '@/hooks/useJobActivityIndicators';
import { ActivityDot } from '@/components/ui/ActivityDot';
import { getSupplierMe } from '@/lib/api/supplierPortal';
import { socket } from '@/lib/socket';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
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
  Store,
  Building2,
  ChevronDown,
  UserCircle,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

type AdminNavChild = { label: string; path: string };
type AdminNavGroup = { type: 'group'; label: string; icon: ReactNode; children: AdminNavChild[] };
type AdminNavLink = { type: 'link'; label: string; path: string; icon: ReactNode };
type AdminNavEntry = AdminNavLink | AdminNavGroup;

const adminNavStructure: AdminNavEntry[] = [
  { type: 'link', label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { type: 'link', label: 'Analytics', path: '/admin/analytics', icon: <Activity className="h-4 w-4 shrink-0" /> },
  { type: 'link', label: 'Fraud Center', path: '/admin/fraud-center', icon: <ShieldAlert className="h-4 w-4 shrink-0" /> },
  {
    type: 'group',
    label: 'Users',
    icon: <Users className="h-4 w-4 shrink-0" />,
    children: [
      { label: 'Customers', path: '/admin/customers' },
      { label: 'Providers', path: '/admin/providers' },
      { label: 'Suppliers', path: '/admin/suppliers' },
    ],
  },
  {
    type: 'group',
    label: 'Work',
    icon: <Briefcase className="h-4 w-4 shrink-0" />,
    children: [
      { label: 'Jobs', path: '/admin/jobs' },
      { label: 'Categories', path: '/admin/categories' },
    ],
  },
  {
    type: 'group',
    label: 'Finance',
    icon: <DollarSign className="h-4 w-4 shrink-0" />,
    children: [
      { label: 'Jobs Payments', path: '/admin/payments' },
      { label: 'Withdrawals', path: '/admin/withdrawals' },
      { label: 'Refund repayments', path: '/admin/refund-repayments' },
    ],
  },
];

function adminPathMatches(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function navPathMatches(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function adminGroupActive(pathname: string, children: AdminNavChild[]) {
  return children.some((c) => adminPathMatches(pathname, c.path));
}

const branchStaffNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/supplier/dashboard', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { label: 'Orders', path: '/supplier/orders', icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
  { label: 'Inventory', path: '/supplier/inventory', icon: <Store className="h-4 w-4 shrink-0" /> },
  { label: 'Earnings', path: '/supplier/earnings', icon: <DollarSign className="h-4 w-4 shrink-0" /> },
];

const supplierNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/supplier/dashboard', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { label: 'Branches', path: '/supplier/branches', icon: <Building2 className="h-4 w-4 shrink-0" /> },
  { label: 'Orders', path: '/supplier/orders', icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
  { label: 'Inventory', path: '/supplier/inventory', icon: <Store className="h-4 w-4 shrink-0" /> },
  { label: 'Earnings', path: '/supplier/earnings', icon: <DollarSign className="h-4 w-4 shrink-0" /> },
];

function notificationsPathForRole(role: string | undefined): string {
  switch (role) {
    case 'admin':
      return '/admin/notifications';
    case 'provider':
      return '/provider/notifications';
    case 'supplier':
    case 'branch_staff':
      return '/supplier/notifications';
    default:
      return '/user/notifications';
  }
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();
  const { isApproved, isProfileComplete } = useProviderStatus();
  const isProfileBlocked = Boolean(user && 'blocked' in user && user.blocked);

  const notificationsHref = useMemo(() => notificationsPathForRole(user?.role), [user?.role]);

  const { data: branchStaffProfile } = useQuery({
    queryKey: ['supplier', 'profile', user?.id],
    queryFn: () => getSupplierMe(),
    enabled: Boolean(user?.id && user?.role === 'branch_staff'),
  });
  const branchAvatarUrl = resolveUploadUrl(branchStaffProfile?.supplierLogo || branchStaffProfile?.logo);

  const sidebarAvatarUrl = useMemo(() => {
    if (!user) return '';
    if (user.role === 'branch_staff') return branchAvatarUrl;
    if (user.role === 'user' || user.role === 'provider') {
      return resolveUploadUrl(user.profileImage);
    }
    if (user.role === 'supplier' && 'supplierProfile' in user) {
      return resolveUploadUrl(user.supplierProfile?.logo);
    }
    return '';
  }, [user, branchAvatarUrl]);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count', user?.id],
    queryFn: () => getUnreadCount(),
    enabled: Boolean(user?.id),
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const { hasJobsNavActivity, hasRequestsNavActivity } = useJobActivityIndicators();
  const jobsNavPath =
    user?.role === 'provider' ? '/provider/jobs' : user?.role === 'user' ? '/user/jobs' : null;
  const requestsNavPath = user?.role === 'provider' ? '/provider/requests' : null;

  useEffect(() => {
    if (!user?.id) return;

    const refreshUnread = () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', user.id] });
    };
    const refreshAuthOnAccountChange = (notification?: { type?: string }) => {
      refreshUnread();
      if (
        user.role === 'provider' &&
        (notification?.type === 'account_unblocked' ||
          notification?.type === 'account_blocked' ||
          notification?.type === 'provider_approved')
      ) {
        void refreshProfile();
      }
    };

    socket.on('notification:new', refreshAuthOnAccountChange);
    socket.on('message:new', refreshUnread);
    socket.on('notification:read', refreshUnread);
    socket.on('notification:read-all', refreshUnread);
    socket.on('notification:job-read', refreshUnread);

    return () => {
      socket.off('notification:new', refreshAuthOnAccountChange);
      socket.off('message:new', refreshUnread);
      socket.off('notification:read', refreshUnread);
      socket.off('notification:read-all', refreshUnread);
      socket.off('notification:job-read', refreshUnread);
    };
  }, [queryClient, refreshProfile, user?.id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'provider') return;

    const refreshProviderProfile = () => {
      if (document.visibilityState === 'visible') {
        void refreshProfile();
      }
    };

    window.addEventListener('focus', refreshProviderProfile);
    document.addEventListener('visibilitychange', refreshProviderProfile);

    return () => {
      window.removeEventListener('focus', refreshProviderProfile);
      document.removeEventListener('visibilitychange', refreshProviderProfile);
    };
  }, [refreshProfile, user?.role]);

  const showInactiveProviderOverlay =
    user?.role === 'provider' &&
    location.pathname !== '/provider/profile' &&
    !isProfileBlocked &&
    (!isProfileComplete || !isApproved);

  const [adminGroupOpen, setAdminGroupOpen] = useState<Record<string, boolean>>({});

  const setAdminGroupExpanded = useCallback((label: string, open: boolean) => {
    setAdminGroupOpen((prev) => ({ ...prev, [label]: open }));
  }, []);

  const isAdminGroupExpanded = useCallback(
    (group: AdminNavGroup) => {
      if (adminGroupOpen[group.label] !== undefined) return adminGroupOpen[group.label];
      return adminGroupActive(location.pathname, group.children);
    },
    [adminGroupOpen, location.pathname],
  );

  useEffect(() => {
    if (user?.role !== 'admin') return;
    adminNavStructure.forEach((entry) => {
      if (entry.type === 'group' && adminGroupActive(location.pathname, entry.children)) {
        setAdminGroupOpen((prev) => (prev[entry.label] === undefined ? { ...prev, [entry.label]: true } : prev));
      }
    });
  }, [location.pathname, user?.role]);

  const getNavItems = (): NavItem[] => {
    switch (user?.role) {
      case 'provider':
        return providerNavItems;
      case 'supplier':
        return supplierNavItems;
      case 'branch_staff':
        return branchStaffNavItems;
      default:
        return userNavItems;
    }
  };

  const navItems = getNavItems();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'admin':
        return 'Administrator';
      case 'provider':
        return 'Service Provider';
      case 'supplier':
        return 'Hardware supplier';
      case 'branch_staff':
        return 'Branch staff';
      default:
        return 'Customer';
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
            {user?.role === 'user' || user?.role === 'provider' || user?.role === 'supplier' || user?.role === 'branch_staff' ? (
              <Link
                to={
                  user.role === 'provider'
                    ? '/provider/profile'
                    : user.role === 'supplier'
                      ? '/supplier/profile'
                      : user.role === 'branch_staff'
                        ? '/supplier/branch-profile'
                        : '/user/profile'
                }
                onClick={() => setSidebarOpen(false)}
                className="flex min-w-0 items-center gap-3 rounded-md p-1 -m-1 transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                  {sidebarAvatarUrl ? (
                    <img src={sidebarAvatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate font-medium text-sm">{user?.name}</p>
                    {user.role === 'provider' && (!isProfileComplete || !isApproved) && !isProfileBlocked && (
                      <AlertCircle
                        className="h-4 w-4 shrink-0 text-amber-600"
                        aria-label="Profile needs attention"
                      />
                    )}
                    {isProfileBlocked && (
                      <AlertCircle
                        className="h-4 w-4 shrink-0 text-destructive"
                        aria-label="Profile blocked"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{getRoleLabel()}</p>
                  {isProfileBlocked && (
                    <p className="text-xs font-medium text-destructive">Profile blocked</p>
                  )}
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
            {user?.role === 'admin' ? (
              adminNavStructure.map((entry) => {
                if (entry.type === 'link') {
                  const active = adminPathMatches(location.pathname, entry.path);
                  return (
                    <Link
                      key={entry.path}
                      to={entry.path}
                      onClick={() => setSidebarOpen(false)}
                      className={cn('nav-link relative', active && 'active')}
                    >
                      {entry.icon}
                      <span>{entry.label}</span>
                      {active && <ChevronRight className="ml-auto h-4 w-4" />}
                    </Link>
                  );
                }
                const expanded = isAdminGroupExpanded(entry);
                const groupActive = adminGroupActive(location.pathname, entry.children);
                return (
                  <Collapsible
                    key={entry.label}
                    open={expanded}
                    onOpenChange={(open) => setAdminGroupExpanded(entry.label, open)}
                  >
                    <CollapsibleTrigger
                      type="button"
                      className={cn(
                        'nav-link w-full',
                        groupActive && 'text-foreground font-medium',
                      )}
                      aria-expanded={expanded}
                    >
                      {entry.icon}
                      <span>{entry.label}</span>
                      <ChevronDown
                        className={cn(
                          'ml-auto h-4 w-4 shrink-0 transition-transform',
                          expanded && 'rotate-180',
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-0.5 pl-2 pt-0.5">
                      {entry.children.map((child) => {
                        const childActive = adminPathMatches(location.pathname, child.path);
                        return (
                          <Link
                            key={child.path}
                            to={child.path}
                            onClick={() => setSidebarOpen(false)}
                            className={cn(
                              'nav-link relative pl-8 text-sm',
                              childActive && 'active',
                            )}
                          >
                            {child.path === '/admin/customers' ? (
                              <UserCircle className="h-4 w-4 shrink-0" />
                            ) : child.path === '/admin/providers' ? (
                              <Users className="h-4 w-4 shrink-0" />
                            ) : child.path === '/admin/suppliers' ? (
                              <Package className="h-4 w-4 shrink-0" />
                            ) : child.path === '/admin/jobs' ? (
                              <Briefcase className="h-4 w-4 shrink-0" />
                            ) : child.path === '/admin/categories' ? (
                              <Tags className="h-4 w-4 shrink-0" />
                            ) : child.path === '/admin/payments' ? (
                              <CreditCard className="h-4 w-4 shrink-0" />
                            ) : child.path === '/admin/withdrawals' ? (
                              <Wallet className="h-4 w-4 shrink-0" />
                            ) : child.path === '/admin/refund-repayments' ? (
                              <RotateCcw className="h-4 w-4 shrink-0" />
                            ) : (
                              <Tags className="h-4 w-4 shrink-0" />
                            )}
                            <span>{child.label}</span>
                            {childActive && <ChevronRight className="ml-auto h-4 w-4" />}
                          </Link>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })
            ) : (
              navItems.map((item) => {
                const active = navPathMatches(location.pathname, item.path);
                return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'nav-link relative',
                    active && 'active',
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {jobsNavPath && item.path === jobsNavPath && hasJobsNavActivity && (
                    <ActivityDot className="ml-1" aria-label="Job activity" />
                  )}
                  {requestsNavPath && item.path === requestsNavPath && hasRequestsNavActivity && (
                    <ActivityDot className="ml-1" aria-label="New requests" />
                  )}
                  {active && (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </Link>
              );
              })
            )}
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
          <div className="relative space-y-6 p-4 mb-20 sm:mb-24 md:mb-24 lg:mb-24 md:space-y-8 lg:p-8">
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
          <div className="fixed left-0 right-0 bottom-0 border-t border-border px-4 py-4 lg:px-8 bg-background">
            <LegalFooterLinks className="justify-center lg:justify-center" />
          </div>
        </main>
      </div>
    </div>
  );
}
