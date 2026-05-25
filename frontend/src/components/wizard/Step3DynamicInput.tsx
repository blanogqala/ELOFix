import { useState, useRef, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Category,
  Measurements,
  type CameraAssistMeasurement,
} from '@/types';
import { Check, Plus, Minus, AlertCircle, Package, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MeasurementCard } from '@/components/measurements/MeasurementCard';
import {
  calculateArea,
  deriveMeasureStep,
  getVideoDisplayRect,
  overlayPointFromClient,
  pixelDistance,
  tapMeasurePreview,
  toMeters,
  type MeasureStep,
  type Point2D,
} from '@/lib/measurements';
export interface Step3DynamicInputProps {
  category: Category;
  measurements: Measurements;
  setMeasurements: (m: Measurements) => void;
  images: string[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  appendImageUrls?: (files: File[], options?: { appendToJobImages?: boolean }) => Promise<string[]>;
  setImages: Dispatch<SetStateAction<string[]>>;
}

function MeasurementsStepContent({
  category,
  measurements,
  setMeasurements,
  images,
  isLoading,
  setIsLoading,
  appendImageUrls,
  setImages,
}: Step3DynamicInputProps) {
  const { toast } = useToast();
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const measureOverlayRef = useRef<HTMLDivElement>(null);
  const [overlaySize, setOverlaySize] = useState({ w: 320, h: 180 });
  const [captureReady, setCaptureReady] = useState(false);
  const capturedFileRef = useRef<File | null>(null);

  const [camUnit, setCamUnit] = useState<'m' | 'cm'>('m');
  const [camLen, setCamLen] = useState('');
  const [camWid, setCamWid] = useState('');
  const [manualExpanded, setManualExpanded] = useState(false);

  /** Tap-to-measure: two taps for length segment (calibrate with real meters), then two taps for width */
  const [tapLengthPts, setTapLengthPts] = useState<Point2D[]>([]);
  const [tapWidthPts, setTapWidthPts] = useState<Point2D[]>([]);
  const [realLengthMStr, setRealLengthMStr] = useState('');
  const [calibratedLengthM, setCalibratedLengthM] = useState<number | null>(null);

  const hasCameraAssist = measurements.cameraAssist?.source === 'camera';

  const measureStep: MeasureStep = deriveMeasureStep(tapLengthPts, calibratedLengthM, tapWidthPts);

  const tapPreview = useMemo(() => {
    if (calibratedLengthM == null) return null;
    return tapMeasurePreview(tapLengthPts, tapWidthPts, calibratedLengthM);
  }, [tapLengthPts, tapWidthPts, calibratedLengthM]);

  const resetTapMeasure = () => {
    setTapLengthPts([]);
    setTapWidthPts([]);
    setRealLengthMStr('');
    setCalibratedLengthM(null);
  };

  const stepBanner = (step: MeasureStep): string => {
    switch (step) {
      case 'length':
        return 'Step 1: Tap both ends of the length';
      case 'calibrate':
        return 'Enter the real length (m), then tap Set length';
      case 'width':
        return 'Step 2: Tap both ends of the width';
      case 'ready':
        return 'Review your measurement, then save';
    }
  };

  useEffect(() => {
    if (!cameraOpen) return;
    const el = measureOverlayRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      setOverlaySize({ w: r.width, h: r.height });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cameraOpen]);

  useEffect(() => {
    if (!cameraOpen) return;
    let stream: MediaStream | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          await el.play();
        }
      } catch (err) {
        toast({
          title: 'Camera unavailable',
          description: err instanceof Error ? err.message : 'Allow camera access and try again.',
          variant: 'destructive',
        });
        setCameraOpen(false);
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      const el = videoRef.current;
      if (el) el.srcObject = null;
    };
  }, [cameraOpen, toast]);

  const manualPreviewAreaM2 = useMemo(() => {
    const w = parseFloat(camWid);
    const l = parseFloat(camLen);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(l) || l <= 0) return null;
    const lM = toMeters(l, camUnit);
    const wM = toMeters(w, camUnit);
    if (lM === undefined || wM === undefined) return null;
    return calculateArea(lM, wM);
  }, [camLen, camWid, camUnit]);

  const resetDialogFields = () => {
    setCamLen('');
    setCamWid('');
    setCamUnit('m');
    setManualExpanded(false);
    setCaptureReady(false);
    capturedFileRef.current = null;
    resetTapMeasure();
  };

  const openCameraDialog = () => {
    resetDialogFields();
    setCameraOpen(true);
  };

  const stripCameraAssistFromImages = (m: Measurements) => {
    const url = m.cameraAssist?.imageUrl;
    if (url) {
      setImages((prev) => prev.filter((u) => u !== url));
    }
  };

  const handleEditStructured = () => {
    stripCameraAssistFromImages(measurements);
    setMeasurements({ ...measurements, cameraAssist: undefined, values: {} });
    toast({ title: 'Switched to manual entry', description: 'Enter measurements in the fields below.' });
  };

  const handleRetake = () => {
    stripCameraAssistFromImages(measurements);
    setMeasurements({ ...measurements, cameraAssist: undefined, values: {} });
    openCameraDialog();
  };

  const captureFrame = (): Promise<boolean> => {
    return new Promise((resolve) => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || !v.videoWidth) {
        resolve(false);
        return;
      }
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve(false);
        return;
      }
      ctx.drawImage(v, 0, 0);
      c.toBlob(
        (blob) => {
          if (!blob) {
            resolve(false);
            return;
          }
          capturedFileRef.current = new File([blob], `measure-${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          setCaptureReady(true);
          resolve(true);
        },
        'image/jpeg',
        0.85
      );
    });
  };

  const uploadCapturedFrame = async (): Promise<string | undefined> => {
    if (!capturedFileRef.current || !appendImageUrls) return undefined;
    const urls = await appendImageUrls([capturedFileRef.current], { appendToJobImages: false });
    return urls[0];
  };

  const ensureFrameCaptured = async (): Promise<void> => {
    if (captureReady && capturedFileRef.current) return;
    const ok = await captureFrame();
    if (!ok) {
      toast({
        title: 'Could not capture photo',
        description: 'Measurement will be saved without a reference image.',
      });
    }
  };

  const persistCameraAssist = async (
    cameraAssist: CameraAssistMeasurement,
    values: Record<string, number>
  ) => {
    setMeasurements({
      ...measurements,
      source: 'MANUAL',
      values: { ...measurements.values, ...values },
      cameraAssist,
    });
    setCameraOpen(false);
    resetDialogFields();
    const areaM2 = values.area;
    toast({
      title: 'Camera assisted measurement saved',
      description: `Area ${areaM2.toFixed(2)} m² — visible to your provider.`,
    });
  };

  const handleCalibrateLength = () => {
    if (tapLengthPts.length !== 2) return;
    const L = parseFloat(realLengthMStr);
    const d = pixelDistance(tapLengthPts[0], tapLengthPts[1]);
    if (!Number.isFinite(L) || L <= 0) {
      toast({ title: 'Enter a valid length in meters', variant: 'destructive' });
      return;
    }
    if (d <= 0) {
      toast({ title: 'Tap two distinct points', variant: 'destructive' });
      return;
    }
    setCalibratedLengthM(L);
    setTapWidthPts([]);
    toast({
      title: 'Calibration set',
      description: 'Tap both ends of the width on the video.',
    });
  };

  const undoLastTap = () => {
    if (tapWidthPts.length > 0) {
      setTapWidthPts((p) => p.slice(0, -1));
      return;
    }
    if (calibratedLengthM != null) {
      setCalibratedLengthM(null);
      return;
    }
    if (tapLengthPts.length > 0) {
      setTapLengthPts((p) => p.slice(0, -1));
    }
  };

  const onOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (manualExpanded) return;
    const overlay = measureOverlayRef.current;
    const video = videoRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const display = getVideoDisplayRect(
      rect.width,
      rect.height,
      video?.videoWidth ?? 0,
      video?.videoHeight ?? 0
    );
    const pt = overlayPointFromClient(e.clientX, e.clientY, rect, display);
    if (!pt.valid) {
      toast({
        title: 'Tap on the video',
        description: 'Place points on the visible surface, not the black edges.',
        variant: 'destructive',
      });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);

    if (measureStep === 'length' && tapLengthPts.length < 2) {
      setTapLengthPts((p) => [...p, { x: pt.x, y: pt.y }]);
      return;
    }
    if (measureStep === 'calibrate') {
      toast({
        title: 'Set length first',
        description: 'Enter the real length (m) and tap Set length.',
        variant: 'destructive',
      });
      return;
    }
    if (measureStep === 'width' && tapWidthPts.length < 2) {
      setTapWidthPts((p) => [...p, { x: pt.x, y: pt.y }]);
    }
  };

  const saveTapMeasurement = async () => {
    if (!tapPreview || tapPreview.areaM2 < 0.5) {
      toast({
        title: 'Invalid measurement',
        description: 'Complete tap steps. Area must be at least 0.5 m².',
        variant: 'destructive',
      });
      return;
    }
    await ensureFrameCaptured();
    let imageUrl: string | undefined;
    if (capturedFileRef.current && appendImageUrls) {
      try {
        imageUrl = await uploadCapturedFrame();
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Could not upload photo.',
          variant: 'destructive',
        });
      }
    }
    const { lengthM, widthM, areaM2 } = tapPreview;
    await persistCameraAssist(
      {
        type: 'area',
        unit: 'm',
        dimensionMode: 'lengthWidth',
        width: widthM,
        length: lengthM,
        source: 'camera',
        area: areaM2,
        ...(imageUrl ? { imageUrl } : {}),
      },
      { length: lengthM, width: widthM, area: areaM2 }
    );
  };

  const saveManualMeasurement = async () => {
    if (manualPreviewAreaM2 === null || manualPreviewAreaM2 < 0.5) {
      toast({
        title: 'Invalid measurement',
        description: 'Enter valid length and width. Area must be at least 0.5 m².',
        variant: 'destructive',
      });
      return;
    }
    const width = parseFloat(camWid);
    const length = parseFloat(camLen);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(length) || length <= 0) {
      toast({ title: 'Length and width required', variant: 'destructive' });
      return;
    }

    await ensureFrameCaptured();
    let imageUrl: string | undefined;
    if (capturedFileRef.current && appendImageUrls) {
      try {
        imageUrl = await uploadCapturedFrame();
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Could not upload photo.',
          variant: 'destructive',
        });
      }
    }

    const areaM2 = manualPreviewAreaM2;
    const widthM = toMeters(width, camUnit)!;
    const lengthM = toMeters(length, camUnit)!;

    await persistCameraAssist(
      {
        type: 'area',
        unit: camUnit,
        dimensionMode: 'lengthWidth',
        width,
        length,
        source: 'camera',
        area: areaM2,
        ...(imageUrl ? { imageUrl } : {}),
      },
      { length: lengthM, width: widthM, area: areaM2 }
    );
  };

  const handleSaveMeasurement = async () => {
    if (manualExpanded) {
      await saveManualMeasurement();
      return;
    }
    await saveTapMeasurement();
  };

  const canSaveTap = measureStep === 'ready' && tapPreview != null && tapPreview.areaM2 >= 0.5;
  const canSaveManual =
    manualExpanded && manualPreviewAreaM2 != null && manualPreviewAreaM2 >= 0.5;
  const canSave = manualExpanded ? canSaveManual : canSaveTap;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Measurements</h2>
        <p className="text-muted-foreground">Enter or estimate the measurements for your task</p>
      </div>

      {!hasCameraAssist && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="flex flex-1 items-center gap-4 rounded-lg bg-muted/50 p-4">
            <Camera className="h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Camera assisted measurement</p>
              <p className="text-xs text-muted-foreground">
                Tap both ends of the length, enter its size in metres, then tap both ends of the width to calculate area.
              </p>
            </div>
            <Button variant="outline" size="sm" type="button" onClick={openCameraDialog}>
              Open camera
            </Button>
          </div>
        </div>
      )}

      {hasCameraAssist && measurements.cameraAssist && (
        <MeasurementCard
          measurement={measurements.cameraAssist}
          onEdit={handleEditStructured}
          onRetake={handleRetake}
        />
      )}

      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          setCameraOpen(open);
          if (!open) {
            resetDialogFields();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Camera assisted measurement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div
              ref={measureOverlayRef}
              className={cn(
                'relative aspect-video w-full overflow-hidden rounded-md bg-black',
                manualExpanded && 'sr-only absolute h-px w-px overflow-hidden opacity-0'
              )}
            >
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              {!manualExpanded && (
                <>
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-[15] bg-black/55 px-2 py-2 text-center text-[11px] leading-snug text-white sm:text-xs">
                    <span className="block font-medium">{stepBanner(measureStep)}</span>
                  </div>
                  <div
                    role="presentation"
                    className="absolute inset-0 z-10 cursor-crosshair"
                    onPointerDown={onOverlayPointerDown}
                  />
                  <svg
                    className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                    width={overlaySize.w}
                    height={overlaySize.h}
                    aria-hidden
                  >
                    {tapLengthPts.map((p, i) => (
                      <circle
                        key={`len-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={6}
                        fill="hsl(var(--primary))"
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    ))}
                    {tapLengthPts.length === 2 && (
                      <line
                        x1={tapLengthPts[0].x}
                        y1={tapLengthPts[0].y}
                        x2={tapLengthPts[1].x}
                        y2={tapLengthPts[1].y}
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                      />
                    )}
                    {tapWidthPts.map((p, i) => (
                      <circle
                        key={`wid-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={6}
                        fill="hsl(var(--accent))"
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    ))}
                    {tapWidthPts.length === 2 && (
                      <line
                        x1={tapWidthPts[0].x}
                        y1={tapWidthPts[0].y}
                        x2={tapWidthPts[1].x}
                        y2={tapWidthPts[1].y}
                        stroke="hsl(var(--accent))"
                        strokeWidth={2}
                      />
                    )}
                  </svg>
                </>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {!manualExpanded && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={undoLastTap}
                    disabled={tapLengthPts.length === 0 && tapWidthPts.length === 0}
                  >
                    Undo last tap
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={resetTapMeasure}>
                    Reset
                  </Button>
                </div>

                {(measureStep === 'calibrate' || measureStep === 'width' || measureStep === 'ready') && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[140px] flex-1">
                      <Label htmlFor="tap-len-m">Real length (m)</Label>
                      <Input
                        id="tap-len-m"
                        type="number"
                        step="any"
                        min={0}
                        value={realLengthMStr}
                        onChange={(e) => setRealLengthMStr(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mb-0.5"
                      onClick={handleCalibrateLength}
                      disabled={tapLengthPts.length !== 2}
                    >
                      Set length
                    </Button>
                  </div>
                )}

                {tapPreview && measureStep === 'ready' && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                    <p className="font-medium text-foreground">Your measurement</p>
                    <p className="mt-1 text-muted-foreground">
                      Length: {tapPreview.lengthM.toFixed(2)} m · Width: {tapPreview.widthM.toFixed(2)} m · Area:{' '}
                      <span className="font-medium text-foreground">{tapPreview.areaM2.toFixed(2)} m²</span>
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => setManualExpanded(true)}
                >
                  Enter dimensions manually instead
                </button>
              </>
            )}

            {manualExpanded && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Manual dimensions</p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setManualExpanded(false)}
                  >
                    Back to tap measure
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="self-center text-xs font-medium text-muted-foreground">Unit:</span>
                  {(['m', 'cm'] as const).map((u) => (
                    <Button
                      key={u}
                      type="button"
                      size="sm"
                      variant={camUnit === u ? 'default' : 'outline'}
                      className="h-8"
                      onClick={() => setCamUnit(u)}
                    >
                      {u}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cam-len">Length ({camUnit})</Label>
                    <Input
                      id="cam-len"
                      type="number"
                      step="any"
                      min={0}
                      value={camLen}
                      onChange={(e) => setCamLen(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cam-wid">Width ({camUnit})</Label>
                    <Input
                      id="cam-wid"
                      type="number"
                      step="any"
                      min={0}
                      value={camWid}
                      onChange={(e) => setCamWid(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Area →{' '}
                  <span className="font-medium text-foreground">
                    {manualPreviewAreaM2 !== null ? `${manualPreviewAreaM2.toFixed(2)} m²` : '—'}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  A reference photo is captured automatically when you save.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCameraOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveMeasurement()} disabled={!canSave}>
              Save measurement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!hasCameraAssist && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="area">Area (sqm)</Label>
            <Input
              id="area"
              type="number"
              placeholder="e.g., 15"
              value={measurements.values.area || ''}
              onChange={(e) =>
                setMeasurements({
                  ...measurements,
                  source: 'MANUAL',
                  values: { ...measurements.values, area: parseFloat(e.target.value) || 0 },
                })
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="length">Length (m)</Label>
            <Input
              id="length"
              type="number"
              placeholder="e.g., 5"
              value={measurements.values.length || ''}
              onChange={(e) =>
                setMeasurements({
                  ...measurements,
                  source: 'MANUAL',
                  values: { ...measurements.values, length: parseFloat(e.target.value) || 0 },
                })
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="width">Width (m)</Label>
            <Input
              id="width"
              type="number"
              placeholder="e.g., 3"
              value={measurements.values.width || ''}
              onChange={(e) =>
                setMeasurements({
                  ...measurements,
                  source: 'MANUAL',
                  values: { ...measurements.values, width: parseFloat(e.target.value) || 0 },
                })
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="height">Height (m)</Label>
            <Input
              id="height"
              type="number"
              placeholder="e.g., 2.5"
              value={measurements.values.height || ''}
              onChange={(e) =>
                setMeasurements({
                  ...measurements,
                  source: 'MANUAL',
                  values: { ...measurements.values, height: parseFloat(e.target.value) || 0 },
                })
              }
              className="mt-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function Step3DynamicInput({
  category,
  measurements,
  setMeasurements,
  images,
  isLoading,
  setIsLoading,
  appendImageUrls,
  setImages,
}: Step3DynamicInputProps) {
  const [otherItemName, setOtherItemName] = useState('');
  const [otherItemWeight, setOtherItemWeight] = useState('');

  if (category.step3Type === 'measurements') {
    return (
      <MeasurementsStepContent
        category={category}
        measurements={measurements}
        setMeasurements={setMeasurements}
        images={images}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
        appendImageUrls={appendImageUrls}
        setImages={setImages}
      />
    );
  }

  if (category.step3Type === 'items') {
    const movingItems = measurements.movingItems || [];

    const updateItemQty = (itemId: string, delta: number) => {
      const existing = movingItems.find((i) => i.id === itemId);
      if (existing) {
        const newQty = Math.max(0, existing.qty + delta);
        if (newQty === 0) {
          setMeasurements({
            ...measurements,
            movingItems: movingItems.filter((i) => i.id !== itemId),
          });
        } else {
          setMeasurements({
            ...measurements,
            movingItems: movingItems.map((i) => (i.id === itemId ? { ...i, qty: newQty } : i)),
          });
        }
      } else {
        const commonItem = category.commonItems?.find((ci) => ci.id === itemId);
        if (commonItem) {
          setMeasurements({
            ...measurements,
            movingItems: [
              ...movingItems,
              {
                id: itemId,
                name: commonItem.name,
                qty: 1,
                weight: commonItem.defaultWeight,
              },
            ],
          });
        }
      }
    };

    const addOtherItem = () => {
      if (!otherItemName.trim()) return;

      setMeasurements({
        ...measurements,
        movingItems: [
          ...movingItems,
          {
            id: `other-${Date.now()}`,
            name: otherItemName,
            qty: 1,
            weight: parseFloat(otherItemWeight) || undefined,
            description: 'Custom item',
          },
        ],
      });
      setOtherItemName('');
      setOtherItemWeight('');
    };

    const getItemQty = (itemId: string) => {
      return movingItems.find((i) => i.id === itemId)?.qty || 0;
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">What are you moving?</h2>
          <p className="text-muted-foreground">Select items and quantities to help us estimate your move</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {category.commonItems?.map((item) => {
            const qty = getItemQty(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  'rounded-lg border p-4 transition-colors',
                  qty > 0 ? 'border-primary bg-primary/5' : 'border-border'
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-2xl">{item.icon}</span>
                  {qty > 0 && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                      {qty}
                    </span>
                  )}
                </div>
                <p className="mb-2 text-sm font-medium">{item.name}</p>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    type="button"
                    onClick={() => updateItemQty(item.id, -1)}
                    disabled={qty === 0}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-medium">{qty}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    type="button"
                    onClick={() => updateItemQty(item.id, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="mb-3 flex items-center gap-2 font-medium">
            <Package className="h-4 w-4" />
            Add Other Items
          </h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Item name (e.g., Piano)"
                value={otherItemName}
                onChange={(e) => setOtherItemName(e.target.value)}
              />
            </div>
            <div className="w-24">
              <Input
                type="number"
                placeholder="Weight (kg)"
                value={otherItemWeight}
                onChange={(e) => setOtherItemWeight(e.target.value)}
              />
            </div>
            <Button type="button" onClick={addOtherItem} disabled={!otherItemName.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {movingItems.filter((i) => i.description === 'Custom item').length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Custom Items</h4>
            {movingItems
              .filter((i) => i.description === 'Custom item')
              .map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    {item.weight && (
                      <p className="text-xs text-muted-foreground">Est. weight: {item.weight}kg</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      type="button"
                      onClick={() => updateItemQty(item.id, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm">{item.qty}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      type="button"
                      onClick={() => updateItemQty(item.id, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {movingItems.length > 0 && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="font-medium">Moving Summary</p>
            <p className="text-sm text-muted-foreground">
              {movingItems.reduce((sum, i) => sum + i.qty, 0)} items • Est.{' '}
              {movingItems.reduce((sum, i) => sum + (i.weight || 20) * i.qty, 0)}kg total
            </p>
          </div>
        )}
      </div>
    );
  }

  if (category.step3Type === 'issue') {
    const plumbingIssue = measurements.plumbingIssue || { type: '', description: '' };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Issue type</h2>
          <p className="text-muted-foreground">
            Choose a category for the issue. Describe it in the task description above and add photos there if needed.
          </p>
        </div>

        <div>
          <Label className="mb-2 block">What type of issue is this?</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {category.issueTypes?.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  setMeasurements({
                    ...measurements,
                    plumbingIssue: { type, description: '' },
                    values: { ...measurements.values, issueType: 1 },
                  })
                }
                className={cn(
                  'rounded-lg border p-3 text-left text-sm font-medium transition-colors',
                  plumbingIssue.type === type
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/30'
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            The provider will confirm exact requirements and provide a final quote after reviewing your request.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
