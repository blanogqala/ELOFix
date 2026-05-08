import { useNavigate } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { cn } from '@/lib/utils';

type SupplierSupportFabProps = {
  /** Optional extra classes for positioning (e.g. z-index). */
  className?: string;
};

/** Floating action to open Notifications with the support thread. */
export function SupplierSupportFab({ className }: SupplierSupportFabProps) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/supplier/notifications', { state: { openSupport: true } })}
      className={cn(
        'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg',
        'hover:scale-105 active:scale-95 transition-transform duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      aria-label="Message support"
    >
      <LifeBuoy className="h-6 w-6" />
    </button>
  );
}
