import { useEffect } from 'react';
import { useLoading } from '@/components/common/loading';

export function useTransactionOverlay(busy: boolean, message: string) {
  const { startLoading, stopLoading } = useLoading();

  useEffect(() => {
    if (!busy) return;
    startLoading(message);
    return () => stopLoading();
  }, [busy, message, startLoading, stopLoading]);
}
