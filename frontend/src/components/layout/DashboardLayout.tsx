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
  { label: 'Dashboard', path: '/user/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'New Request', path: '/user/new-request', icon: <FileText className="h-5 w-5" /> },
  { label: 'My Jobs', path: '/user/jobs', icon: <Briefcase className="h-5 w-5" /> },
  { label: 'Material Orders', path: '/user/material-orders', icon: <ShoppingCart className="h-5 w-5" /> },
  { label: 'Payments', path: '/user/payments', icon: <CreditCard className="h-5 w-5" /> },
  { label: 'Profile', path: '/user/profile', icon: <User className="h-5 w-5" /> },
];

const providerNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/provider/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'Requests', path: '/provider/requests', icon: <ClipboardList className="h-5 w-5" /> },
  { label: 'Active Jobs', path: '/provider/jobs', icon: <Briefcase className="h-5 w-5" /> },
  { label: 'Earnings', path: '/provider/earnings', icon: <DollarSign className="h-5 w-5" /> },
  { label: 'Profile', path: '/provider/profile', icon: <User className="h-5 w-5" /> },
];

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'Providers', path: '/admin/providers', icon: <Users className="h-5 w-5" /> },
  { label: 'Suppliers', path: '/admin/suppliers', icon: <Package className="h-5 w-5" /> },
  { label: 'Categories', path: '/admin/categories', icon: <Tags className="h-5 w-5" /> },
  { label: 'Jobs', path: '/admin/jobs', icon: <Briefcase className="h-5 w-5" /> },
  { label: 'Payments', path: '/admin/payments', icon: <CreditCard className="h-5 w-5" /> },
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
    <div className="min-h-screen bg-secondary-foreground/25">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-50 flex items-center justify-between px-4 h-16 border-b border-border bg-card">
        <EloFixLogo variant="dark" className="h-16 ml-4" />
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 h-screen bg-card border-r border-border transform transition-transform duration-200 lg:translate-x-0 lg:sticky top-0 bottom-0 lg:z-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Sidebar Header - Desktop only */}
          <div className="hidden lg:flex items-center gap-2 px-6 h-16 border-b border-border justify-center">
            <EloFixLogo variant="dark" className="h-16" />
          </div>

          {/* User Info */}
          <div className="p-4 border-b border-border mt-16 lg:mt-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{getRoleLabel()}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-1">
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
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
            <button 
              onClick={handleLogout}
              className="nav-link w-full text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-5 w-5" />
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
        <main className="flex-1 min-h-screen lg:min-h-[calc(100vh-4rem)]">
          <div className="p-4 lg:p-8 relative">
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
