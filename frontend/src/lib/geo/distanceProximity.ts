export type DistanceProximityBand = 'near' | 'medium' | 'far' | 'unknown';

const NEAR_KM = 15;
const MEDIUM_KM = 50;

export function distanceProximityBand(km: number | null | undefined): DistanceProximityBand {
  if (km == null || !Number.isFinite(km)) return 'unknown';
  if (km < NEAR_KM) return 'near';
  if (km < MEDIUM_KM) return 'medium';
  return 'far';
}

export function distanceProximityLabel(band: DistanceProximityBand): string {
  switch (band) {
    case 'near':
      return 'Nearby';
    case 'medium':
      return 'Moderate distance';
    case 'far':
      return 'Far';
    default:
      return 'Distance unknown';
  }
}

/** Card border/background classes for store branch proximity. */
export function distanceProximityCardClass(band: DistanceProximityBand): string {
  switch (band) {
    case 'near':
      return 'border-emerald-500/60 bg-emerald-500/5 hover:bg-emerald-500/10';
    case 'medium':
      return 'border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10';
    case 'far':
      return 'border-border bg-card hover:bg-card/80';
    default:
      return 'border-border bg-card hover:bg-card/80';
  }
}

export function distanceProximityBadgeClass(band: DistanceProximityBand): string {
  switch (band) {
    case 'near':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100';
    case 'medium':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
    case 'far':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
