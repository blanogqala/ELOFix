import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProviderStatus } from '@/hooks/useProviderStatus';
import { Button } from '@/components/ui/button';
import { EloFixLogo } from '@/components/EloFixLogo';
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
  { label: 'Profile', path: '/user/profile', icon: <User className="h-4 w-4 shrink-0" /> },
];

const providerNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/provider/dashboard', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { label: 'Requests', path: '/provider/requests', icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
  { label: 'Active Jobs', path: '/provider/jobs', icon: <Briefcase className="h-4 w-4 shrink-0" /> },
  { label: 'Earnings', path: '/provider/earnings', icon: <DollarSign className="h-4 w-4 shrink-0" /> },
  { label: 'Profile', path: '/provider/profile', icon: <User className="h-4 w-4 shrink-0" /> },
];

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { label: 'Providers', path: '/admin/providers', icon: <Users className="h-4 w-4 shrink-0" /> },
  { label: 'Suppliers', path: '/admin/suppliers', icon: <Package className="h-4 w-4 shrink-0" /> },
  { label: 'Categories', path: '/admin/categories', icon: <Tags className="h-4 w-4 shrink-0" /> },
  { label: 'Jobs', path: '/admin/jobs', icon: <Briefcase className="h-4 w-4 shrink-0" /> },
  { label: 'Payments', path: '/admin/payments', icon: <CreditCard className="h-4 w-4 shrink-0" /> },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isActiveProvider, isApproved, isProfileComplete } = useProviderStatus();

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

          {/* User Info */}
          <div className="mt-16 shrink-0 border-b border-border p-4 lg:mt-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{getRoleLabel()}</p>
              </div>
            </div>
          </div>

          {/* Navigation — scrolls if many items; logout stays at bottom */}
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
            {navItems.map((item) => {
              const showProfileWarning =
                user?.role === 'provider' &&
                item.path === '/provider/profile' &&
                (!isProfileComplete || !isApproved);
              return (
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
                  {showProfileWarning && (
                    <AlertCircle
                      className="h-4 w-4 shrink-0 text-amber-600"
                      aria-label="Profile needs attention"
                    />
                  )}
                  {location.pathname === item.path && (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="shrink-0 border-t border-border p-4">
            <button 
              onClick={handleLogout}
              className="nav-link w-full text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Logout</span>
            </button>
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
