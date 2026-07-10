import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { EloFixLogo } from '@/components/EloFixLogo';
import { getCurrentSession } from '@/lib/api/auth';
import { getDefaultDashboardPath } from '@/lib/postLoginRedirect';

function stripExchangeFromBrowserUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('exchange')) return;
  params.delete('exchange');
  const qs = params.toString();
  const clean = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  window.history.replaceState({}, '', clean);
}

export default function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeGoogleAuth } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState('Completing Google sign-in...');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    async function finishGoogleAuth() {
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      const nextPath = searchParams.get('next') || '';

      if (error) {
        toast({
          title: 'Google sign-in failed',
          description: errorDescription || 'Could not complete Google sign-in.',
          variant: 'destructive',
        });
        navigate('/login', { replace: true });
        return;
      }

      const exchange = searchParams.get('exchange');
      if (!exchange) {
        toast({
          title: 'Google sign-in failed',
          description: 'Missing authorization response from Google.',
          variant: 'destructive',
        });
        navigate('/login', { replace: true });
        return;
      }

      stripExchangeFromBrowserUrl();

      const existingSession = getCurrentSession();
      if (existingSession?.user && existingSession.token) {
        navigate(getDefaultDashboardPath(existingSession.user.role), { replace: true });
        return;
      }

      try {
        setMessage('Signing you in...');
        const user = await completeGoogleAuth(exchange);

        toast({
          title: searchParams.get('mode') === 'register' ? 'Account created!' : 'Welcome back!',
          description:
            user.role === 'provider'
              ? 'Welcome! Complete your profile to get approved.'
              : 'You have successfully signed in with Google.',
        });

        const isNewProviderRegister =
          searchParams.get('mode') === 'register' && user.role === 'provider';
        navigate(getDefaultDashboardPath(user.role), {
          replace: true,
          ...(isNewProviderRegister ? { state: { newProviderOnboarding: true } } : {}),
        });
      } catch (err) {
        toast({
          title: 'Google sign-in failed',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
        navigate('/login', { replace: true });
      }
    }

    void finishGoogleAuth();
  }, [completeGoogleAuth, navigate, searchParams, toast]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <EloFixLogo variant="dark" className="h-24" />
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
