import { MapPin, Package } from 'lucide-react';
import {
  formatGeoPointLabel,
  getJobDeliverySpecs,
  jobHasExplicitDeliverySpecs,
} from '@/lib/jobDeliverySpecs';
import type { DeliveryRequestRecord, Job } from '@/types';

interface JobDeliveryRequirementsBlockProps {
  job: Job;
  deliveryRequest?: DeliveryRequestRecord | null;
}

export function JobDeliveryRequirementsBlock({
  job,
  deliveryRequest,
}: JobDeliveryRequirementsBlockProps) {
  if (!jobHasExplicitDeliverySpecs(job, deliveryRequest)) return null;

  const { collection, destination, items } = getJobDeliverySpecs(job, deliveryRequest);

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Collection address
        </p>
        <p className="text-sm break-words leading-relaxed [overflow-wrap:anywhere]">
          {formatGeoPointLabel(collection)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Destination address
        </p>
        <p className="text-sm break-words leading-relaxed [overflow-wrap:anywhere]">
          {formatGeoPointLabel(destination)}
        </p>
      </div>
      {items.length > 0 ? (
        <div>
          <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Items
          </p>
          <ul className="space-y-1.5 text-sm">
            {items.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className="flex justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  × {item.qty}
                  {item.weightKg != null ? ` · ${item.weightKg} kg` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
