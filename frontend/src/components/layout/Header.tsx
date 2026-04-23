import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { EloFixLogo } from '@/components/EloFixLogo';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Menu, User, LogOut, Settings, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';

export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getDashboardPath = () => {
    if (!user) return '/';
    switch (user.role) {
      case 'admin': return '/admin/dashboard';
      case 'provider': return '/provider/dashboard';
      default: return '/user/dashboard';
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full max-w-full overflow-x-hidden border-b border-border/40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container flex h-16 min-w-0 max-w-full items-center justify-between gap-2 px-3 sm:px-4">
        <div className="min-w-0 shrink">
          <EloFixLogo variant="dark" className="h-12 sm:h-16" />
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden min-w-0 md:flex md:items-center md:gap-4 lg:gap-6 ">
          <div className="flex items-center gap-8 mr-64">
            <Link to="/#home" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Home
            </Link>
            <Link to="/#categories" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Services
            </Link>
            <Link to="/#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </Link>
            <Link to="/#why-choose-us" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Why Choose Us
            </Link>
          </div>
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex max-w-full min-w-0 items-center gap-2">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <span className="truncate font-medium">{user?.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate(getDashboardPath())}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/${user?.role}/profile`)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => navigate('/login')}>
                Sign In
              </Button>
              <Button className="btn-accent" onClick={() => navigate('/register')}>
                Get Started
              </Button>
            </div>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="shrink-0 md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 py-4 animate-fade-in">
          <nav className="flex flex-col gap-3">
            <Link to="/#home" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link to="/#categories" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Services</Link>
            <Link to="/#how-it-works" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>How It Works</Link>
            <Link to="/#why-choose-us" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Why Choose Us</Link>
            {isAuthenticated ? (
              <>
                <Link to={getDashboardPath()} className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="px-3 py-2 text-sm font-medium text-destructive text-left">Logout</button>
              </>
            ) : (
              <div className="flex flex-col gap-2 pt-2">
                <Button variant="outline" onClick={() => { navigate('/login'); setMobileMenuOpen(false); }}>Sign In</Button>
                <Button className="btn-accent" onClick={() => { navigate('/register'); setMobileMenuOpen(false); }}>Get Started</Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
