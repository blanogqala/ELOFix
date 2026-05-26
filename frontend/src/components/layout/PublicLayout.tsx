import { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

interface PublicLayoutProps {
  children: ReactNode;
  /** When true, content spans full width without extra container padding constraints */
  wide?: boolean;
}

export function PublicLayout({ children, wide = false }: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className={wide ? 'flex-1' : 'flex-1 container py-8 md:py-12'}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
