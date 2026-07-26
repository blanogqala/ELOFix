import type { DeliveryRequestRecord, Job } from '@/types';
import { isCourierCancellationUnderReview } from '@/lib/jobUtils';

export type CourierMapRoutePhase =
  | 'to_collection'
  | 'at_collection'
  | 'to_destination'
  | 'at_destination';

export interface CustomerCourierTrackingBanner {
  title: string;
  description: string;
  tone: string;
}

const ACTIVE_COURIER_DELIVERY_STATUSES = new Set([
  'READY',
  'COLLECTING',
  'COLLECTED',
  'OUT_FOR_DELIVERY',
  'AT_DESTINATION',
]);

const receiptFeedbackBanner = (): CustomerCourierTrackingBanner => ({
  title: 'Receipt confirmed — share feedback',
  description: 'Open your order details to rate the delivery when you have a moment.',
  tone: 'border-amber-500/30 bg-amber-500/10',
});

/** Customer-facing status banner for courier job delivery tracking. */
export function getCustomerCourierTrackingBanner(
  fs: string,
  job: Job,
  dr: DeliveryRequestRecord
): CustomerCourierTrackingBanner {
  const status = String(fs || 'READY').toUpperCase();
  const jobCancelled = String(job.status || '').toUpperCase() === 'CANCELLED';
  const drCancelled = String(dr.status || '').toLowerCase() === 'cancelled';
  const underReview = isCourierCancellationUnderReview(job);

  if (underReview) {
    return {
      title: 'Under investigation',
      description:
        'This courier cancelled mid-delivery. The previous delivery fee is under refund review. You can choose a new delivery option on your material order.',
      tone: 'border-amber-500/40 bg-amber-500/10',
    };
  }

  if (jobCancelled || drCancelled || status === 'CANCELLED') {
    return {
      title: 'Delivery cancelled',
      description:
        'This courier delivery was cancelled. Choose a new delivery option on your material order so materials can be delivered.',
      tone: 'border-destructive/40 bg-destructive/10',
    };
  }

  const fullyComplete =
    job.status === 'COMPLETED' ||
    job.completionConfirmedByUser === true ||
    (dr.deliveryConfirmed === true && dr.customerRating != null);

  if (fullyComplete) {
    return {
      title: 'Delivery completed',
      description: 'Thank you — your delivery has been confirmed and closed.',
      tone: 'border-emerald-500/30 bg-emerald-500/10',
    };
  }
  if (status === 'FAILED') {
    return {
      title: 'Delivery could not be completed',
      description: 'Your courier reported an issue. Contact support if you still need help.',
      tone: 'border-destructive/40 bg-destructive/10',
    };
  }
  if (status === 'DELAYED') {
    return {
      title: 'Delivery running late',
      description: 'Your courier is still on the way. Thanks for your patience.',
      tone: 'border-amber-500/40 bg-amber-500/12',
    };
  }
  if (status === 'READY') {
    return {
      title: 'Courier preparing for pickup',
      description: 'Your courier will head to the pickup location shortly.',
      tone: 'border-border bg-muted/20',
    };
  }
  if (status === 'COLLECTING') {
    return {
      title: 'Courier heading to collection',
      description: 'Your courier is on the way to the pickup location. Live location updates below.',
      tone: 'border-primary/30 bg-primary/5',
    };
  }
  if (status === 'COLLECTED') {
    return {
      title: 'Items collected',
      description: 'Your courier has collected your items and will head to you shortly.',
      tone: 'border-primary/30 bg-primary/5',
    };
  }
  if (status === 'OUT_FOR_DELIVERY') {
    return {
      title: 'On the way to you',
      description: 'Follow live movement on the map as your delivery approaches.',
      tone: 'border-accent/40 bg-accent/10',
    };
  }
  if (status === 'AT_DESTINATION') {
    return {
      title: 'Courier has arrived',
      description: 'Your courier is at your location and will complete delivery shortly.',
      tone: 'border-accent/40 bg-accent/10',
    };
  }
  if (status === 'COMPLETED') {
    if (dr.deliveryConfirmed === true && !dr.customerRating) {
      return receiptFeedbackBanner();
    }
    return {
      title: 'Delivered — please confirm',
      description: 'Confirm receipt when everything looks good to close this job.',
      tone: 'border-success/30 bg-success/5',
    };
  }
  if (
    dr.deliveryConfirmed === true &&
    !dr.customerRating &&
    !ACTIVE_COURIER_DELIVERY_STATUSES.has(status)
  ) {
    return receiptFeedbackBanner();
  }
  return {
    title: 'Delivery',
    description: 'Live tracking starts once your courier begins the trip.',
    tone: 'border-border bg-muted/20',
  };
}

/** Map route phase for customer courier tracking UI. */
export function getCourierMapRoutePhase(
  fs: string,
  dr: DeliveryRequestRecord,
  mapCompletedMode: boolean
): CourierMapRoutePhase {
  if (mapCompletedMode) return 'to_destination';
  const status = String(fs || 'READY').toUpperCase();
  const phase = String(dr.courierPhase || '').toLowerCase();
  if (status === 'AT_DESTINATION' || phase === 'at_destination') return 'at_destination';
  if (status === 'OUT_FOR_DELIVERY' || phase === 'to_destination') return 'to_destination';
  if (status === 'COLLECTED' || phase === 'at_collection') return 'at_collection';
  return 'to_collection';
}

export function courierMapShowsDestination(
  fs: string,
  mapCompletedMode: boolean
): boolean {
  if (mapCompletedMode) return true;
  const status = String(fs || 'READY').toUpperCase();
  return status === 'OUT_FOR_DELIVERY' || status === 'AT_DESTINATION';
}
