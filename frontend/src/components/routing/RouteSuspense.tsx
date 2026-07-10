import { Suspense, type ReactNode } from 'react';
import { LoadingPage } from '@/components/common/loading';

export function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingPage />}>{children}</Suspense>;
}
