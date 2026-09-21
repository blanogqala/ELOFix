import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveUploadUrl } from '@/lib/uploadUrl';

export function CatalogMediaImage({
  src,
  alt,
  className,
  iconClassName,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  const resolved = resolveUploadUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  if (!resolved || failed) {
    return (
      <span className={cn('flex size-full items-center justify-center bg-primary/5', className)}>
        <Package className={cn('h-10 w-10 text-primary/50', iconClassName)} aria-hidden />
      </span>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      className={cn('pointer-events-none block h-full w-full object-cover', className)}
      onError={() => setFailed(true)}
    />
  );
}
