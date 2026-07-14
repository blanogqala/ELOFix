import { MeasurementCard } from '@/components/measurements/MeasurementCard';
import {
  categoryUsesMeasurementFields,
  categorySkipsStep3Specs,
  getJobCategoryStep3Type,
  measurementsHaveStructuredSpecs,
} from '@/lib/jobSpecifications';
import type { Job, Measurements } from '@/types';
import { Package, Ruler } from 'lucide-react';

function getMeasurementValue(
  values: Record<string, number> | undefined,
  key: 'area' | 'length' | 'width'
): number | undefined {
  if (!values) return undefined;
  const exact = values[key];
  if (typeof exact === 'number' && Number.isFinite(exact)) return exact;
  const fallback = Object.entries(values).find(
    ([k, v]) => k.toLowerCase() === key && Number.isFinite(Number(v))
  );
  if (!fallback) return undefined;
  return Number(fallback[1]);
}

function formatMeasurementRows(
  values: Record<string, number> | undefined
): Array<{ label: string; value: string }> {
  if (!values) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const area = getMeasurementValue(values, 'area');
  const length = getMeasurementValue(values, 'length');
  const width = getMeasurementValue(values, 'width');
  if (area !== undefined) rows.push({ label: 'Area', value: `${area} m²` });
  if (length !== undefined) rows.push({ label: 'Length', value: `${length} m` });
  if (width !== undefined) rows.push({ label: 'Width', value: `${width} m` });
  for (const [k, v] of Object.entries(values)) {
    const key = k.toLowerCase();
    if (key === 'area' || key === 'length' || key === 'width') continue;
    const label = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
    rows.push({ label, value: String(v) });
  }
  return rows;
}

interface JobCustomerRequirementsBlockProps {
  job: Job;
  /** Customer-submitted measurements at request time (not provider-adjusted). */
  measurements: Measurements;
}

export function JobCustomerRequirementsBlock({ job, measurements }: JobCustomerRequirementsBlockProps) {
  const step3 = getJobCategoryStep3Type(job);
  if (categorySkipsStep3Specs(step3)) {
    return null;
  }

  const rows = formatMeasurementRows(measurements.values);
  const hasStructured = measurementsHaveStructuredSpecs(measurements);
  const hasMovingItems =
    Array.isArray(measurements.movingItems) && measurements.movingItems.length > 0;
  const issue = measurements.plumbingIssue;
  const hasIssue =
    issue &&
    (String(issue.type || '').trim().length > 0 || String(issue.description || '').trim().length > 0);

  if (!hasStructured) {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          {job.requiresInspection === false
            ? 'No detailed measurements or checklist were added when you submitted this request. See the job description and photos under Job Details.'
            : 'You did not add measurements or a checklist at request time. Your provider may confirm requirements after inspection, or see the description under Job Details.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        What you submitted when requesting this service
      </p>

      {measurements.cameraAssist ? (
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Ruler className="h-3.5 w-3.5" aria-hidden />
            Guided measurement
          </p>
          <MeasurementCard measurement={measurements.cameraAssist} />
        </div>
      ) : null}

      {categoryUsesMeasurementFields(step3) && rows.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Ruler className="h-3.5 w-3.5" aria-hidden />
            Measurements
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {rows.map((row) => (
              <div key={row.label} className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-muted-foreground text-xs">{row.label}</p>
                <p className="font-medium tabular-nums">{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step3 === 'items' && hasMovingItems ? (
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" aria-hidden />
            Items to move
          </p>
          <ul className="space-y-1.5 text-sm">
            {measurements.movingItems!.map((item) => (
              <li
                key={item.id}
                className="flex justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">× {item.qty}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step3 === 'issue' && hasIssue ? (
        <div className="space-y-2 text-sm">
          <p className="text-sm font-medium">Issue reported</p>
          {issue!.type ? (
            <div>
              <p className="text-muted-foreground text-xs">Type</p>
              <p>{issue!.type}</p>
            </div>
          ) : null}
          {issue!.description?.trim() ? (
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Details</p>
              <p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
                {issue!.description.trim()}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Source: {measurements.source ?? 'MANUAL'}
      </p>
    </div>
  );
}
