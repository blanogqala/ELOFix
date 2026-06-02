import type { DeliveryGeoPoint, DeliveryRequestItem, JobLocation, Measurements } from '@/types';

const KEY = 'elofix_service_request_draft_v2';

export type ServiceRequestDraft = {
  currentStep: number;
  selectedCategory: string;
  location: Partial<JobLocation>;
  description: string;
  images: string[];
  measurements: Measurements;
  useMeasurements: boolean;
  selectedProvider: string;
  /** Courier flow (delivery / moving categories) */
  collection?: DeliveryGeoPoint;
  destination?: DeliveryGeoPoint;
  deliveryItems?: DeliveryRequestItem[];
  selectedCourier?: string;
  lockDestination?: boolean;
  savedAt: number;
};

export function readServiceRequestDraft(): ServiceRequestDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY) || sessionStorage.getItem('elofix_service_request_draft_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServiceRequestDraft>;
    if (typeof parsed.currentStep !== 'number' || parsed.currentStep < 1 || parsed.currentStep > 4) {
      return null;
    }
    return {
      currentStep: parsed.currentStep,
      selectedCategory: typeof parsed.selectedCategory === 'string' ? parsed.selectedCategory : '',
      location: parsed.location && typeof parsed.location === 'object' ? parsed.location : {},
      description: typeof parsed.description === 'string' ? parsed.description : '',
      images: Array.isArray(parsed.images) ? parsed.images.filter((i) => typeof i === 'string') : [],
      measurements:
        parsed.measurements && typeof parsed.measurements === 'object'
          ? parsed.measurements
          : { source: 'MANUAL', values: {} },
      useMeasurements: Boolean(parsed.useMeasurements),
      selectedProvider: typeof parsed.selectedProvider === 'string' ? parsed.selectedProvider : '',
      collection:
        parsed.collection && typeof parsed.collection === 'object' ? parsed.collection : undefined,
      destination:
        parsed.destination && typeof parsed.destination === 'object' ? parsed.destination : undefined,
      deliveryItems: Array.isArray(parsed.deliveryItems) ? parsed.deliveryItems : undefined,
      selectedCourier: typeof parsed.selectedCourier === 'string' ? parsed.selectedCourier : undefined,
      lockDestination: Boolean(parsed.lockDestination),
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeServiceRequestDraft(draft: Omit<ServiceRequestDraft, 'savedAt'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* quota / privacy mode */
  }
}

export function clearServiceRequestDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem('elofix_service_request_draft_v1');
  } catch {
    /* ignore */
  }
}
