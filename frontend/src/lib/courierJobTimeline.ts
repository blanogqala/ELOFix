import type { Job } from '@/types';
import type { DeliveryRequestRecord } from '@/types';
import { getUserTimelineViewState, type UserTimelineViewState } from '@/lib/userJobTimeline';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';

/** Six-step timeline for delivery / moving (courier) jobs. */
export const COURIER_TIMELINE_STEPS = [
  'Pending',
  'Awaiting Payment',
  'Collecting',
  'Delivery',
  'Awaiting Confirmation',
  'Completed',
] as const;

export type CourierTimelineViewState = UserTimelineViewState;

function deliveryPaid(dr: DeliveryRequestRecord | null | undefined): boolean {
  if (!dr) return false;
  return dr.status === 'paid' || dr.payment?.deliveryPaid === true;
}

function fulfillmentUpper(dr: DeliveryRequestRecord | null | undefined): string {
  return String(dr?.fulfillmentStatus || '').toUpperCase();
}

/**
 * Courier workflow step 0–5 from job status + linked delivery request.
 */
export function getCourierTimelineStepIndex(
  job: Job,
  deliveryRequest: DeliveryRequestRecord | null | undefined
): number {
  if (job.status === 'CANCELLED' || job.status === 'REJECTED') return 0;
  if (job.completionConfirmedByUser === true || job.status === 'COMPLETED') return 5;
  if (job.status === 'AWAITING_CONFIRMATION') return 4;

  const fs = fulfillmentUpper(deliveryRequest);
  const drStatus = String(deliveryRequest?.status || '').toLowerCase();

  if (fs === 'COMPLETED' || drStatus === 'completed') return 4;
  if (fs === 'OUT_FOR_DELIVERY' || fs === 'AT_DESTINATION') return 3;
  if (fs === 'COLLECTING' || fs === 'COLLECTED' || deliveryPaid(deliveryRequest)) return 2;
  if (job.status !== 'PENDING') return 1;
  return 0;
}

export function getCourierTimelineViewState(
  job: Job,
  deliveryRequest: DeliveryRequestRecord | null | undefined,
  materialRequests: MaterialRequestDto[] = []
): CourierTimelineViewState {
  const base = getUserTimelineViewState(job, materialRequests);
  if (base.terminal !== 'none') return base;

  const currentIdx = getCourierTimelineStepIndex(job, deliveryRequest);
  const stored = Number.isFinite(Number(job.progressStep)) ? Number(job.progressStep) : 0;
  return {
    ...base,
    currentIdx: Math.max(stored, currentIdx),
  };
}

export function getCourierTimelineStepInsight(
  job: Job,
  deliveryRequest: DeliveryRequestRecord | null | undefined,
  stepIndex: number
): { stepLabel: string; nextAction: string } {
  const label = COURIER_TIMELINE_STEPS[stepIndex] ?? `Step ${stepIndex + 1}`;
  const drStatus = String(deliveryRequest?.status || 'pending_quote');
  const fs = fulfillmentUpper(deliveryRequest);

  const actions: Record<number, string> = {
    0: 'Review the request and accept or decline.',
    1:
      drStatus === 'quoted'
        ? 'Waiting for the customer to accept your quote and pay.'
        : drStatus === 'approved'
          ? 'Quote accepted — waiting for customer payment.'
          : 'Submit your delivery fee quote for the customer to pay.',
    2: 'Collect items from the pickup address, then start delivery when ready.',
    3: 'Deliver to the destination. Share live location while en route.',
    4: 'Waiting for the customer to confirm delivery is complete.',
    5: 'Delivery completed.',
  };

  if (stepIndex === 2 && (fs === 'COLLECTING' || fs === 'COLLECTED')) {
    return {
      stepLabel: label,
      nextAction:
        fs === 'COLLECTING'
          ? 'Heading to the pickup address — confirm when you arrive.'
          : 'Items collected — start delivery to the customer when ready.',
    };
  }
  if (stepIndex === 3) {
    return {
      stepLabel: label,
      nextAction:
        fs === 'AT_DESTINATION'
          ? 'At the destination — complete delivery when handed over.'
          : 'En route to the customer — confirm arrival, then complete delivery.',
    };
  }

  return { stepLabel: label, nextAction: actions[stepIndex] ?? '—' };
}

/** Dashboard / job list label for delivery & moving (never "Inspected"). */
export function getCourierJobDisplayStatusLabel(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null
): string {
  if (job.status === 'CANCELLED') return 'Cancelled';
  if (job.status === 'REJECTED') return 'Rejected';
  const idx = deliveryRequest
    ? getCourierTimelineStepIndex(job, deliveryRequest)
    : Math.min(
        5,
        Math.max(
          0,
          Number.isFinite(Number(job.progressStep))
            ? Number(job.progressStep)
            : job.status === 'COMPLETED' || job.completionConfirmedByUser
              ? 5
              : job.status === 'AWAITING_CONFIRMATION'
                ? 4
                : job.status === 'IN_PROGRESS'
                  ? 3
                  : job.status === 'PENDING'
                    ? 0
                    : 1
        )
      );
  return COURIER_TIMELINE_STEPS[idx] ?? 'Pending';
}
