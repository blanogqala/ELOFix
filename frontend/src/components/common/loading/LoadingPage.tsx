import { useEffect, useState } from 'react';
import { EloFixLogo } from '@/components/EloFixLogo';
import { LoadingBar } from './LoadingBar';
import { cn } from '@/lib/utils';

const ROTATING_MESSAGES = [
  'Verifying information...',
  'Securing payment...',
  'Loading your dashboard...',
  'Connecting trusted providers...',
  'Almost ready...',
] as const;

interface LoadingPageProps {
  message?: string;
  className?: string;
}

export function LoadingPage({ message, className }: LoadingPageProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const displayMessage = message ?? ROTATING_MESSAGES[messageIndex];

  useEffect(() => {
    if (message) return;

    const interval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % ROTATING_MESSAGES.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [message]);

  return (
    <div
      className={cn(
        'flex min-h-screen flex-col items-center justify-center bg-white px-6',
        className,
      )}
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>
      <div className="flex w-full max-w-xs flex-col items-center gap-8">
        <EloFixLogo variant="dark" clickable={false} className="h-14" />
        <LoadingBar className="w-full" />
        <p
          key={displayMessage}
          className="loading-message-fade text-center text-sm font-medium text-[#0F172A]"
          aria-live="polite"
        >
          {displayMessage}
        </p>
      </div>
    </div>
  );
}
