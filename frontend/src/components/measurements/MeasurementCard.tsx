import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CameraAssistMeasurement } from '@/types';
import {
  formatAreaLabel,
  formatDimensionLabel,
  areaSquareMetersFromAssist,
  toMeters,
} from '@/lib/measurements';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { Pencil, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MeasurementCardProps {
  measurement: CameraAssistMeasurement;
  onEdit?: () => void;
  onRetake?: () => void;
  className?: string;
}

export function MeasurementCard({ measurement, onEdit, onRetake, className }: MeasurementCardProps) {
  const areaM2 = areaSquareMetersFromAssist(measurement);

  const dims = formatDimensionLabel(measurement);
  const areaLabel = formatAreaLabel(areaM2);
  const u = measurement.unit ?? 'm';
  const lenM =
    measurement.length != null ? toMeters(measurement.length, u) : undefined;
  const widM = measurement.width != null ? toMeters(measurement.width, u) : undefined;
  const htM = measurement.height != null ? toMeters(measurement.height, u) : undefined;

  return (
    <Card className={cn('overflow-hidden border-primary/20', className)}>
      <CardContent className="p-0 sm:p-0">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
          {measurement.imageUrl ? (
            <div className="relative aspect-video w-full bg-muted md:aspect-auto md:min-h-[140px]">
              <img
                src={resolveUploadUrl(measurement.imageUrl)}
                alt=""
                className="h-full w-full object-cover"
              />
              {measurement.source === 'camera' && (
                <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-0.5 text-xs font-medium shadow">
                  Camera assisted
                </span>
              )}
            </div>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center bg-muted/50 text-sm text-muted-foreground">
              No image
            </div>
          )}
          <div className="flex flex-col justify-center gap-3 p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {measurement.dimensionMode === 'heightWidth' ? 'Height × width' : 'Length × width'}
              </p>
              <p className="text-lg font-semibold">{dims}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Area</p>
              <p className="text-lg font-semibold text-primary">{areaLabel}</p>
            </div>
            <p className="text-sm text-muted-foreground border-t border-border pt-3">
              {measurement.dimensionMode === 'heightWidth' ? (
                <>
                  Height: {htM != null ? `${htM.toFixed(2)} m` : '—'} · Width: {widM != null ? `${widM.toFixed(2)} m` : '—'} ·
                  Area: {areaM2 != null ? `${areaM2.toFixed(2)} m²` : '—'}
                </>
              ) : (
                <>
                  Length: {lenM != null ? `${lenM.toFixed(2)} m` : '—'} · Width: {widM != null ? `${widM.toFixed(2)} m` : '—'} ·
                  Area: {areaM2 != null ? `${areaM2.toFixed(2)} m²` : '—'}
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {onEdit && (
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {onRetake && measurement.source === 'camera' && (
                <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={onRetake}>
                  <Camera className="h-3.5 w-3.5" />
                  Retake
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
