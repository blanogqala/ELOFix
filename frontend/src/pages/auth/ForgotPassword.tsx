import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { requestPasswordReset } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mail } from 'lucide-react';
import { EloFixLogo } from '@/components/EloFixLogo';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);

    try {
      await requestPasswordReset(email);
      navigate('/auth/success?type=email-sent', { replace: true });
    } catch (error) {
      toast({
        title: 'Something went wrong',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1">
        <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md min-w-0 animate-fade-in">
            <div className="mb-1 flex justify-center">
              <EloFixLogo variant="dark" className="h-32" />
            </div>

            <h1 className="mb-1 text-xl font-semibold sm:text-2xl md:text-3xl">Forgot your password?</h1>
            <p className="mb-8 text-sm text-muted-foreground sm:text-base">
              Enter your email and we&apos;ll send reset instructions if an account exists.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <Button type="submit" className="btn-accent h-10 w-full whitespace-nowrap" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send reset link'}
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
            <h2 className="text-3xl font-bold mb-4">Secure account recovery</h2>
            <p className="text-primary-foreground/80">
              We&apos;ll email you a secure link to reset your password. Links expire after 15 minutes.
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
