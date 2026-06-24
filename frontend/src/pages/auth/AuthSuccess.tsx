import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EloFixLogo } from '@/components/EloFixLogo';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';

export default function AuthSuccess() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');

  const isPasswordReset = type === 'password-reset';

  const title = isPasswordReset ? 'Password updated' : 'Check your email';
  const description = isPasswordReset
    ? 'Your password has been changed successfully. You can now sign in with your new password.'
    : 'If an account exists with that email, you will receive password reset instructions shortly. The link expires in 15 minutes.';

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1">
        <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md min-w-0 animate-fade-in text-center">
            <div className="mb-6 flex justify-center">
              <EloFixLogo variant="dark" className="h-32" />
            </div>

            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-success" aria-hidden />
            </div>

            <h1 className="mb-3 text-xl font-semibold sm:text-2xl md:text-3xl">{title}</h1>
            <p className="mb-8 text-sm text-muted-foreground sm:text-base">{description}</p>

            <Button asChild className="btn-accent h-10 w-full whitespace-nowrap">
              <Link to="/login">{isPasswordReset ? 'Sign in' : 'Back to sign in'}</Link>
            </Button>

            {!isPasswordReset && (
              <p className="text-center text-sm text-muted-foreground mt-6">
                Didn&apos;t receive an email?{' '}
                <Link to="/forgot-password" className="text-primary font-medium hover:underline">
                  Try again
                </Link>
              </p>
            )}
          </div>
        </div>

        <div className="hidden lg:flex flex-1 hero-section justify-center p-8">
          <div className="max-w-md text-center text-primary-foreground mt-20 fixed">
            <div className="flex justify-center">
              <EloFixLogo variant="light" className="h-56" clickable={false} />
            </div>
            <h2 className="text-3xl font-bold mb-4">Your trusted maintenance marketplace</h2>
            <p className="text-primary-foreground/80">
              Connect with verified professionals for all your home and business maintenance needs.
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
