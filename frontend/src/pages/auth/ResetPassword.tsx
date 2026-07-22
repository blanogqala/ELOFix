import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { resetPassword } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { EloFixLogo } from '@/components/EloFixLogo';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { isPasswordValid, passwordValidationMessage } from '@/lib/accountValidation';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const passwordError = passwordValidationMessage(password);
    if (passwordError) {
      toast({
        title: 'Weak password',
        description: passwordError,
        variant: 'destructive',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both password fields match.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(token, password);
      navigate('/auth/success?type=password-reset', { replace: true });
    } catch (error) {
      toast({
        title: 'Reset failed',
        description: error instanceof Error ? error.message : 'Invalid or expired reset link.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md min-w-0 text-center animate-fade-in space-y-4">
            <EloFixLogo variant="dark" className="h-24 mx-auto" />
            <h1 className="text-xl font-semibold sm:text-2xl">Invalid reset link</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              This password reset link is missing or invalid. Please request a new one.
            </p>
            <Button asChild className="btn-accent h-10 w-full">
              <Link to="/forgot-password">Request new link</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        </div>
        <div className="border-t border-border bg-muted/30 px-4 py-4">
          <LegalFooterLinks />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1">
        <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md min-w-0 animate-fade-in">
            <div className="mb-1 flex justify-center">
              <EloFixLogo variant="dark" className="h-20 sm:h-28 md:h-32" />
            </div>

            <h1 className="mb-1 text-xl font-semibold sm:text-2xl md:text-3xl">Set a new password</h1>
            <p className="mb-8 text-sm text-muted-foreground sm:text-base">
              Choose a strong password that meets the requirements below.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">New password</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    minLength={8}
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
                <PasswordRequirements password={password} />
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="btn-accent h-10 w-full whitespace-nowrap"
                disabled={isLoading || !isPasswordValid(password)}
              >
                {isLoading ? 'Updating...' : 'Update password'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              <Link to="/login" className="text-primary font-medium hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        </div>

        <div className="hidden lg:flex flex-1 hero-section justify-center p-8">
          <div className="max-w-md text-center text-primary-foreground mt-20 fixed">
            <div className="flex justify-center">
              <EloFixLogo variant="light" className="h-56" clickable={false} />
            </div>
            <h2 className="text-3xl font-bold mb-4">Almost there</h2>
            <p className="text-primary-foreground/80">
              Create a new password to regain access to your EloFix account.
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
