import { cn } from '@/lib/utils';
import { useScrollReveal } from './useScrollReveal';

interface LandingSectionProps {
  id?: string;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
  reveal?: boolean;
}

export function LandingSection({
  id,
  className,
  containerClassName,
  children,
  reveal = true,
}: LandingSectionProps) {
  const { ref, isVisible } = useScrollReveal<HTMLElement>({ threshold: 0.08 });

  return (
    <section
      id={id}
      ref={reveal ? ref : undefined}
      className={cn('scroll-mt-20 py-12 md:py-16', className, reveal && 'landing-reveal', reveal && isVisible && 'landing-reveal-visible')}
    >
      <div className={cn('container', containerClassName)}>{children}</div>
    </section>
  );
}

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'mb-10 md:mb-14',
        align === 'center' && 'mx-auto max-w-3xl text-center',
        align === 'left' && 'max-w-2xl',
        className,
      )}
    >
      {eyebrow && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      )}
      <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-[2.75rem] lg:leading-tight">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">{description}</p>
      )}
    </div>
  );
}
