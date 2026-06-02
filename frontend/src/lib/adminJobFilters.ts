import type { Job } from '@/types';

/** Shared admin filter select width (category, status, city, sort). */
export const ADMIN_FILTER_SELECT_CLASS =
  'input-field h-10 w-36 shrink-0 px-3 text-sm bg-accent/50 border border-accent';

export function getJobCity(job: Job): string {
  return job.location?.city?.trim() || '';
}

/** Distinct cities present on loaded jobs, sorted A–Z. */
export function collectJobCities(jobs: Job[]): string[] {
  const cities = new Set<string>();
  for (const job of jobs) {
    const city = getJobCity(job);
    if (city) cities.add(city);
  }
  return [...cities].sort((a, b) => a.localeCompare(b));
}

export function jobMatchesCityFilter(job: Job, cityFilter: string): boolean {
  if (cityFilter === 'all') return true;
  return getJobCity(job) === cityFilter;
}

export function jobMatchesCategoryFilter(job: Job, categoryFilter: string): boolean {
  if (categoryFilter === 'all') return true;
  return job.category === categoryFilter;
}

export function jobMatchesAdminSearch(job: Job, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const city = getJobCity(job).toLowerCase();
  const area = (job.location?.area || '').toLowerCase();
  const suburb = (job.location?.suburb || '').toLowerCase();
  return (
    job.description.toLowerCase().includes(q) ||
    job.userName.toLowerCase().includes(q) ||
    (job.providerName || '').toLowerCase().includes(q) ||
    job.id.toLowerCase().includes(q) ||
    job.categoryName.toLowerCase().includes(q) ||
    city.includes(q) ||
    area.includes(q) ||
    suburb.includes(q)
  );
}
