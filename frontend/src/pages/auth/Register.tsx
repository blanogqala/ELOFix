import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { redirectToGoogleAuth } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EloFixLogo } from '@/components/EloFixLogo';
import { LegalAgreementCheckbox } from '@/components/legal/LegalAgreementCheckbox';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { buildLegalAcceptancePayload } from '@/lib/legal/versions';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import {
  emailValidationMessage,
  isPasswordValid,
  passwordValidationMessage,
  personNameLettersOnlyHint,
  personNameValidationMessage,
  phoneValidationMessage,
} from '@/lib/accountValidation';

type RegisterFieldErrors = {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
};

export default function Register() {
  const [searchParams] = useSearchParams();
  const defaultRole = searchParams.get('role') === 'provider' ? 'provider' : 'user';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'provider'>(defaultRole);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const { register } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const clearFieldError = (field: keyof RegisterFieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!legalAccepted) {
      toast({
        title: 'Agreement required',
        description: 'Please accept the required legal documents to create an account.',
        variant: 'destructive',
      });
      return;
    }

    const nextErrors: RegisterFieldErrors = {};
    const nameError = personNameValidationMessage(name);
    if (nameError) nextErrors.name = nameError;
    const emailError = emailValidationMessage(email);
    if (emailError) nextErrors.email = emailError;
    const phoneError = phoneValidationMessage(phone);
    if (phoneError) nextErrors.phone = phoneError;
    const passwordError = passwordValidationMessage(password);
    if (passwordError) nextErrors.password = passwordError;

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsLoading(true);

    try {
      await register(name.trim(), email.trim(), phone, password, role, buildLegalAcceptancePayload(role));
      toast({
        title: 'Account created!',
        description: role === 'provider'
          ? 'Welcome! Complete your profile to get approved.'
          : 'Welcome to EloFix! Start by creating a service request.',
      });
      navigate(
        role === 'provider' ? '/provider/profile' : '/user/dashboard',
        role === 'provider' ? { state: { newProviderOnboarding: true } } : undefined,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      const lower = message.toLowerCase();
      if (lower.includes('email') && (lower.includes('exist') || lower.includes('registered') || lower.includes('already'))) {
        setFieldErrors({ email: message });
        return;
      }
      if (lower.includes('phone')) {
        setFieldErrors({ phone: message });
        return;
      }
      if (lower.includes('name')) {
        setFieldErrors({ name: message });
        return;
      }
      if (lower.includes('password')) {
        setFieldErrors({ password: message });
        return;
      }
      toast({
        title: 'Registration failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (isLoading || isGoogleLoading) return;

    if (!legalAccepted) {
      toast({
        title: 'Agreement required',
        description: 'Please accept the required legal documents before continuing with Google.',
        variant: 'destructive',
      });
      return;
    }

    setIsGoogleLoading(true);
    redirectToGoogleAuth({
      mode: 'register',
      role: role === 'provider' ? 'PROVIDER' : 'CUSTOMER',
      legalAcceptance: buildLegalAcceptancePayload(role),
    });
  };

  const nameLettersOnlyHint = personNameLettersOnlyHint(name);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1">
      {/* Left side - Form */}
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md min-w-0 animate-fade-in">
        <div className="mb-1 flex justify-center">
            <EloFixLogo variant="dark" className="h-20 sm:h-28 md:h-32" />
          </div>

          <h1 className="mb-2 text-xl font-semibold sm:text-2xl md:text-3xl">Create an account</h1>
          <p className="mb-6 text-sm text-muted-foreground sm:text-base">Join EloFix to get started</p>

          {/* Role Selection */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              type="button"
              onClick={() => {
                setRole('user');
                setLegalAccepted(false);
              }}
              className={cn(
                "p-4 rounded-lg border-2 transition-all text-center",
                role === 'user'
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="text-2xl mb-1">🏠</div>
              <div className="font-medium text-sm">I need services</div>
              <div className="text-xs text-muted-foreground">Find providers</div>
            </button>
            <button
              type="button"
              onClick={() => {
                setRole('provider');
                setLegalAccepted(false);
              }}
              className={cn(
                "p-4 rounded-lg border-2 transition-all text-center",
                role === 'provider'
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="text-2xl mb-1">🔧</div>
              <div className="font-medium text-sm">I provide services</div>
              <div className="text-xs text-muted-foreground">Grow your business</div>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="name">Full Name</Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your Full Name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearFieldError('name');
                  }}
                  className={cn('pl-10', fieldErrors.name && 'border-destructive')}
                  aria-invalid={Boolean(fieldErrors.name)}
                  autoComplete="name"
                  inputMode="text"
                />
              </div>
              {fieldErrors.name ? (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p>
              ) : nameLettersOnlyHint ? (
                <p className="mt-1 text-xs text-destructive">{nameLettersOnlyHint}</p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError('email');
                  }}
                  className={cn('pl-10', fieldErrors.email && 'border-destructive')}
                  aria-invalid={Boolean(fieldErrors.email)}
                  autoComplete="email"
                />
              </div>
              {fieldErrors.email ? (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.email}</p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    clearFieldError('phone');
                  }}
                  className={cn('pl-10', fieldErrors.phone && 'border-destructive')}
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
              </div>
              {fieldErrors.phone ? (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.phone}</p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError('password');
                  }}
                  className={cn('pl-10 pr-10', fieldErrors.password && 'border-destructive')}
                  aria-invalid={Boolean(fieldErrors.password)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password ? (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.password}</p>
              ) : null}
              <PasswordRequirements password={password} />
            </div>

            <LegalAgreementCheckbox
              role={role}
              checked={legalAccepted}
              onCheckedChange={setLegalAccepted}
              disabled={isLoading}
            />

            <Button
              type="submit"
              className="btn-accent h-10 w-full whitespace-nowrap"
              disabled={isLoading || !legalAccepted || !isPasswordValid(password)}
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-background px-4 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="h-10 w-full whitespace-nowrap bg-accent hover:bg-accent/70"
            onClick={handleGoogleLogin}
            disabled={isLoading || isGoogleLoading || !legalAccepted}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {isGoogleLoading ? 'Redirecting to Google...' : 'Continue with Google'}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Image/Branding */}
      <div className="hidden lg:flex flex-1 hero-section justify-center p-8">
        <div className="max-w-md text-center text-primary-foreground mt-20 fixed">
          <div className="flex justify-center">
            <EloFixLogo variant="light" className="h-56" clickable={false} />
          </div>
          <h2 className="text-3xl font-bold mb-4">
            {role === 'provider'
              ? 'Grow your service business'
              : 'Find trusted professionals'}
          </h2>
          <p className="text-primary-foreground/80">
            {role === 'provider'
              ? 'Register as an independent provider on EloFix. Complete verification to receive job requests and get paid through supported payment flows.'
              : 'Connect with independent professionals for home and business maintenance. Service quotes and material prices are shown in South African Rand (ZAR).'}
          </p>
        </div>
      </div>
      </div>

      <div className="border-t border-border bg-muted/30 px-4 py-4">
        <LegalFooterLinks />
      </div>
    </div>
  );
}
