import { useEffect, useState } from 'react';
import {
  Building2,
  Hammer,
  Home,
  Droplets,
  Paintbrush,
  Plug,
  TreePine,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  paint: Paintbrush,
  electrical: Plug,
  plumbing: Droplets,
  tiles: Home,
  building: Building2,
  timber: TreePine,
  roofing: Home,
  tools: Wrench,
};

export const MARKETPLACE_ICON_OPTIONS = [
  { value: 'paint', label: 'Paint' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'tiles', label: 'Tiles' },
  { value: 'building', label: 'Building' },
  { value: 'timber', label: 'Timber' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'tools', label: 'Tools' },
] as const;

type IconLoader = () => Promise<{ default: LucideIcon }>;

/** Stable key accepted by the existing category API (`parseIcon`). */
export function normalizeMarketplaceIconKey(raw: string | null | undefined): string | null {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  if (!key || !/^[a-z0-9_-]+$/.test(key)) return null;
  return key;
}

export function aliasMarketplaceIcon(icon?: string | null): LucideIcon | null {
  if (!icon) return null;
  return ICONS[icon] ?? null;
}

export function MarketplaceCategoryIcon({
  icon,
  className,
}: {
  icon?: string | null;
  className?: string;
}) {
  const alias = aliasMarketplaceIcon(icon);
  const [Dynamic, setDynamic] = useState<LucideIcon | null>(null);

  useEffect(() => {
    if (!icon || alias) {
      setDynamic(null);
      return;
    }
    const key = icon;
    let cancelled = false;
    setDynamic(null);
    import('lucide-react/dynamicIconImports')
      .then((mod) => {
        const loader = (mod.default as Record<string, IconLoader>)[key];
        if (!loader) return null;
        return loader();
      })
      .then((loaded) => {
        if (!cancelled && loaded?.default) setDynamic(() => loaded.default);
      })
      .catch(() => {
        /* Unknown or failed icon names fall back to the generic mark. */
      });
    return () => {
      cancelled = true;
    };
  }, [alias, icon]);

  const Icon = alias || Dynamic || Hammer;
  return <Icon className={className} aria-hidden />;
}
