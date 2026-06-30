import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EloFixLogo } from '@/components/EloFixLogo';
import { LoadingBar } from './LoadingBar';
import { cn } from '@/lib/utils';

interface LoadingOverlayProps {
  open: boolean;
  message?: string | null;
  className?: string;
}

const DEFAULT_MESSAGE = 'Please wait…';

export function LoadingOverlay({ open, message, className }: LoadingOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = containerRef.current?.querySelector<HTMLElement>('[data-loading-focus]');
    focusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !containerRef.current) return;

      const focusables = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));

      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={containerRef}
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center bg-[#0F172A]/80 p-4 backdrop-blur-sm',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={message ?? DEFAULT_MESSAGE}
    >
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-6 text-center">
          <EloFixLogo variant="dark" clickable={false} className="h-12" />
          <LoadingBar className="w-full" />
          <p className="text-sm font-medium text-[#0F172A]" aria-live="polite">
            {message ?? DEFAULT_MESSAGE}
          </p>
          <button
            type="button"
            data-loading-focus
            className="sr-only"
            tabIndex={0}
          >
            Loading
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
