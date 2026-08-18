import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import type { LegalDocument } from '@/lib/legal/content';
import { cn } from '@/lib/utils';

interface LegalPageLayoutProps {
  document: LegalDocument;
}

export function LegalPageLayout({ document }: LegalPageLayoutProps) {
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState(document.sections[0]?.id ?? '');
  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    const headings = document.sections
      .map((section) => el.querySelector(`#${section.id}`))
      .filter(Boolean) as HTMLElement[];

    let current = headings[0]?.id ?? '';
    for (const heading of headings) {
      const top = heading.getBoundingClientRect().top;
      if (top <= 120) {
        current = heading.id;
      }
    }
    if (current) {
      setActiveSection(current);
    }
  }, [document.sections]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [handleScroll]);

  useEffect(() => {
    if (location.hash) {
      const target = contentRef.current?.querySelector(location.hash);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  const scrollToSection = (sectionId: string) => {
    const target = contentRef.current?.querySelector(`#${sectionId}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="container max-w-6xl py-8 md:py-12">
      {/* Header */}
      <header className="mb-8 border-b border-border pb-8 md:mb-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Version {document.version}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl lg:text-5xl">
          {document.title}
        </h1>
        <p className="mt-3 max-w-3xl text-base text-muted-foreground md:text-lg">{document.subtitle}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          Effective date: <span className="font-medium text-foreground">{document.effectiveDate}</span>
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        {/* Sticky table of contents */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </p>
            <nav className="space-y-1" aria-label="Table of contents">
              {document.sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                    activeSection === section.id
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <ChevronRight
                    className={cn(
                      'mt-0.5 h-3.5 w-3.5 shrink-0 transition-opacity',
                      activeSection === section.id ? 'opacity-100' : 'opacity-0'
                    )}
                    aria-hidden
                  />
                  <span>{section.title}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Mobile quick links */}
          <div className="mt-4 lg:hidden">
            <label htmlFor="legal-section-select" className="sr-only">
              Jump to section
            </label>
            <select
              id="legal-section-select"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={activeSection}
              onChange={(e) => scrollToSection(e.target.value)}
            >
              {document.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </div>
        </aside>

        {/* Content */}
        <div
          ref={contentRef}
          className="legal-content-scroll max-h-none overflow-visible rounded-xl border border-border bg-card p-6 shadow-sm md:p-8 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto scroll-smooth"
        >
          <article className="legal-prose mx-auto max-w-3xl">
            {document.sections.map((section) => (
              <section key={section.id} id={section.id} className="legal-section scroll-mt-24">
                <h2 className="legal-section-title">{section.title}</h2>
                <div className="space-y-4">
                  {section.content.map((paragraph, index) => (
                    <p key={index} className="legal-paragraph">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </article>

          <footer className="mt-12 border-t border-border pt-6">
            <div className="flex flex-wrap gap-3 text-sm">
              <Link to="/legal" className="text-primary hover:underline">
                All Policies
              </Link>
              <Link to="/terms" className="text-primary hover:underline">
                Terms
              </Link>
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy
              </Link>
              <Link to="/escrow-policy" className="text-primary hover:underline">
                Payment Schedule
              </Link>
              <Link to="/dispute-resolution" className="text-primary hover:underline">
                Disputes
              </Link>
              <Link to="/provider-agreement" className="text-primary hover:underline">
                Provider Agreement
              </Link>
              <Link to="/refund-policy" className="text-primary hover:underline">
                Refunds & Returns
              </Link>
              <Link to="/delivery-policy" className="text-primary hover:underline">
                Delivery & Collection
              </Link>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
