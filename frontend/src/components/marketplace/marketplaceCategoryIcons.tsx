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
  { value: 'tiles', label: 'Tiles & Flooring' },
  { value: 'building', label: 'Building Materials' },
  { value: 'timber', label: 'Timber' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'tools', label: 'Tools & Equipment' },
] as const;

export function MarketplaceCategoryIcon({
  icon,
  className,
}: {
  icon?: string | null;
  className?: string;
}) {
  const Icon = (icon && ICONS[icon]) || Hammer;
  return <Icon className={className} aria-hidden />;
}
