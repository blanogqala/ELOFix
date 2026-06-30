import { useState, useRef, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Category,
  Measurements,
  type CameraAssistDimensionMode,
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
import { TapeMeasureOverlay } from '@/components/measurements/TapeMeasureOverlay';
import {
  calculateArea,
  deriveMeasureStep,
  formatSegmentLabelM,
  formatSegmentLabelPx,
  getVideoDisplayRect,
  isSegmentComplete,
  metersFromPixelSegment,
  overlayPointFromClient,
  pixelDistance,
  primaryDimensionLabel,
  segmentOverlayLabel,
  tapMeasurePreview,
  toMeters,
  type MeasureStep,
  type Point2D,
  type Segment2D,
} from '@/lib/measurements';
import { CAMERA_ASSIST_MEASUREMENT_ENABLED } from '@/lib/featureFlags';
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
  const [camHt, setCamHt] = useState('');
  const [manualExpanded, setManualExpanded] = useState(false);
  const [dimMode, setDimMode] = useState<CameraAssistDimensionMode>('lengthWidth');

  const [primarySeg, setPrimarySeg] = useState<Point2D[] | null>(null);
  const [widthSeg, setWidthSeg] = useState<Point2D[] | null>(null);
  const [realPrimaryMStr, setRealPrimaryMStr] = useState('');
  const [calibratedPrimaryM, setCalibratedPrimaryM] = useState<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ anchor: Point2D; current: Point2D; phase: 'primary' | 'width' } | null>(
    null
  );
  const realPrimaryInputRef = useRef<HTMLInputElement>(null);

  const hasCameraAssist =
    CAMERA_ASSIST_MEASUREMENT_ENABLED && measurements.cameraAssist?.source === 'camera';
  const primaryName = primaryDimensionLabel(dimMode);

  const measureStep: MeasureStep = deriveMeasureStep(primarySeg, calibratedPrimaryM, widthSeg);

  const tapPreview = useMemo(() => {
    if (calibratedPrimaryM == null) return null;
    return tapMeasurePreview(primarySeg, widthSeg, calibratedPrimaryM, dimMode);
  }, [primarySeg, widthSeg, calibratedPrimaryM, dimMode]);

  const resetTapMeasure = () => {
    setPrimarySeg(null);
    setWidthSeg(null);
    setRealPrimaryMStr('');
    setCalibratedPrimaryM(null);
    setActiveDrag(null);
  };

  const stepBanner = (step: MeasureStep): string => {
    switch (step) {
      case 'length':
        return `Step 1: Press & drag to measure ${primaryName.toLowerCase()} (tape)`;
      case 'calibrate':
        return `Enter real ${primaryName.toLowerCase()} (m) — value shows on your line`;
      case 'width':
        return 'Step 2: Press & drag to measure width for area';
      case 'ready':
        return 'Review area below, then save';
    }
  };

  const primarySegComplete = isSegmentComplete(primarySeg);
  const widthSegComplete = isSegmentComplete(widthSeg);

  const primaryLineLabel = useMemo(() => {
    if (!primarySegComplete) return '';
    const seg = primarySeg as Segment2D;
    const px = Math.round(pixelDistance(seg[0], seg[1]));
    if (calibratedPrimaryM != null && calibratedPrimaryM > 0) {
      return formatSegmentLabelM(calibratedPrimaryM);
    }
    const typed = parseFloat(realPrimaryMStr);
    if (Number.isFinite(typed) && typed > 0) {
      if (Math.round(typed) === px && px >= 20) {
        return formatSegmentLabelPx(px);
      }
      return formatSegmentLabelM(typed);
    }
    return formatSegmentLabelPx(px);
  }, [primarySegComplete, primarySeg, calibratedPrimaryM, realPrimaryMStr]);

  const widthLineLabel = useMemo(() => {
    if (!widthSegComplete || !primarySegComplete) return '';
    const wSeg = widthSeg as Segment2D;
    const pSeg = primarySeg as Segment2D;
    if (calibratedPrimaryM != null && calibratedPrimaryM > 0) {
      const widthPx = pixelDistance(wSeg[0], wSeg[1]);
      const primaryPx = pixelDistance(pSeg[0], pSeg[1]);
      const wM = metersFromPixelSegment(widthPx, primaryPx, calibratedPrimaryM);
      if (wM != null && wM > 0) return formatSegmentLabelM(wM);
    }
    return segmentOverlayLabel(wSeg, { showPxFallback: true });
  }, [widthSegComplete, widthSeg, primarySegComplete, primarySeg, calibratedPrimaryM]);

  const dragLineLabel = useMemo(() => {
    if (!activeDrag) return '';
    const px = pixelDistance(activeDrag.anchor, activeDrag.current);
    if (px < 8) return '';
    if (activeDrag.phase === 'width' && calibratedPrimaryM != null && primarySegComplete) {
      const pSeg = primarySeg as Segment2D;
      const primaryPx = pixelDistance(pSeg[0], pSeg[1]);
      const wM = metersFromPixelSegment(px, primaryPx, calibratedPrimaryM);
      if (wM != null && wM > 0) return formatSegmentLabelM(wM);
    }
    return formatSegmentLabelPx(px);
  }, [activeDrag, calibratedPrimaryM, primarySegComplete, primarySeg]);

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
    if (!Number.isFinite(w) || w <= 0) return null;
    const primary =
      dimMode === 'heightWidth' ? parseFloat(camHt) : parseFloat(camLen);
    if (!Number.isFinite(primary) || primary <= 0) return null;
    const primaryM = toMeters(primary, camUnit);
    const wM = toMeters(w, camUnit);
    if (primaryM === undefined || wM === undefined) return null;
    return calculateArea(primaryM, wM);
  }, [camLen, camHt, camWid, camUnit, dimMode]);

  const resetDialogFields = () => {
    setCamLen('');
    setCamWid('');
    setCamHt('');
    setCamUnit('m');
    setDimMode('lengthWidth');
    setManualExpanded(false);
    setCaptureReady(false);
    capturedFileRef.current = null;
    resetTapMeasure();
  };

  useEffect(() => {
    if (!cameraOpen || manualExpanded) return;
    if (measureStep === 'calibrate' && primarySegComplete) {
      realPrimaryInputRef.current?.focus();
    }
  }, [cameraOpen, manualExpanded, measureStep, primarySegComplete]);

  /** Pre-fill field with on-screen pixel span; user replaces with real metres (shown on line too). */
  useEffect(() => {
    if (!primarySegComplete || calibratedPrimaryM != null) return;
    const px = Math.round(pixelDistance(primarySeg![0], primarySeg![1]));
    setRealPrimaryMStr(String(px));
  }, [primarySegComplete, primarySeg, calibratedPrimaryM]);


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

  const resolveOverlayPoint = (clientX: number, clientY: number) => {
    const overlay = measureOverlayRef.current;
    const video = videoRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    const display = getVideoDisplayRect(
      rect.width,
      rect.height,
      video?.videoWidth ?? 0,
      video?.videoHeight ?? 0
    );
    return overlayPointFromClient(clientX, clientY, rect, display);
  };

  const applyCalibration = (L: number) => {
    if (!primarySegComplete) return false;
    const d = pixelDistance(primarySeg![0], primarySeg![1]);
    if (!Number.isFinite(L) || L <= 0 || d <= 0) return false;
    setCalibratedPrimaryM(L);
    setRealPrimaryMStr(String(L));
    setWidthSeg(null);
    setActiveDrag(null);
    return true;
  };

  const handleCalibratePrimary = () => {
    const L = parseFloat(realPrimaryMStr);
    if (!applyCalibration(L)) {
      toast({
        title: `Enter a valid ${primaryName.toLowerCase()} in metres`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Scale set',
        description: 'Press & drag to measure width for area.',
      });
    }
  };

  const handleRealPrimaryBlur = () => {
    const L = parseFloat(realPrimaryMStr);
    if (Number.isFinite(L) && L > 0 && measureStep === 'calibrate') {
      applyCalibration(L);
    }
  };

  const undoLastMeasure = () => {
    if (activeDrag) {
      setActiveDrag(null);
      return;
    }
    if (widthSegComplete || widthSeg) {
      setWidthSeg(null);
      return;
    }
    if (calibratedPrimaryM != null) {
      setCalibratedPrimaryM(null);
      return;
    }
    if (primarySegComplete || primarySeg) {
      setPrimarySeg(null);
      setRealPrimaryMStr('');
    }
  };

  const commitDragSegment = (anchor: Point2D, end: Point2D, phase: 'primary' | 'width') => {
    const dist = pixelDistance(anchor, end);
    if (dist < 8) return;
    const seg: Segment2D = [anchor, end];
    if (phase === 'primary') {
      setPrimarySeg(seg);
      setCalibratedPrimaryM(null);
      setWidthSeg(null);
    } else {
      setWidthSeg(seg);
    }
  };

  const onOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (manualExpanded || activeDrag) return;
    const pt = resolveOverlayPoint(e.clientX, e.clientY);
    if (!pt?.valid) {
      toast({
        title: 'Drag on the video',
        description: 'Start on the surface you are measuring.',
        variant: 'destructive',
      });
      return;
    }
    if (measureStep === 'calibrate') {
      toast({
        title: `Set real ${primaryName.toLowerCase()} first`,
        description: 'Enter metres in the field below (replace the pixel hint).',
        variant: 'destructive',
      });
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (measureStep === 'length') {
      setActiveDrag({ anchor: pt, current: pt, phase: 'primary' });
    } else if (measureStep === 'width') {
      setActiveDrag({ anchor: pt, current: pt, phase: 'width' });
    }
  };

  const onOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeDrag) return;
    const pt = resolveOverlayPoint(e.clientX, e.clientY);
    if (pt?.valid) {
      setActiveDrag((d) => (d ? { ...d, current: pt } : null));
    }
  };

  const onOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeDrag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const pt = resolveOverlayPoint(e.clientX, e.clientY) ?? activeDrag.current;
    commitDragSegment(activeDrag.anchor, pt, activeDrag.phase);
    setActiveDrag(null);
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
    const { primaryM, widthM, areaM2, dimensionMode } = tapPreview;
    const values: Record<string, number> = { width: widthM, area: areaM2 };
    const assist: CameraAssistMeasurement = {
      type: 'area',
      unit: 'm',
      dimensionMode,
      width: widthM,
      source: 'camera',
      area: areaM2,
      ...(imageUrl ? { imageUrl } : {}),
    };
    if (dimensionMode === 'heightWidth') {
      assist.height = primaryM;
      values.height = primaryM;
    } else {
      assist.length = primaryM;
      values.length = primaryM;
    }
    await persistCameraAssist(assist, values);
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
    if (!Number.isFinite(width) || width <= 0) {
      toast({ title: 'Width required', variant: 'destructive' });
      return;
    }

    let primaryVal: number | undefined;
    if (dimMode === 'heightWidth') {
      primaryVal = parseFloat(camHt);
      if (!Number.isFinite(primaryVal) || primaryVal <= 0) {
        toast({ title: 'Height required', variant: 'destructive' });
        return;
      }
    } else {
      primaryVal = parseFloat(camLen);
      if (!Number.isFinite(primaryVal) || primaryVal <= 0) {
        toast({ title: 'Length required', variant: 'destructive' });
        return;
      }
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

    const areaM2 = manualPreviewAreaM2!;
    const widthM = toMeters(width, camUnit)!;
    const primaryM = toMeters(primaryVal, camUnit)!;
    const values: Record<string, number> = { width: widthM, area: areaM2 };
    const assist: CameraAssistMeasurement = {
      type: 'area',
      unit: camUnit,
      dimensionMode: dimMode,
      width,
      source: 'camera',
      area: areaM2,
      ...(imageUrl ? { imageUrl } : {}),
    };
    if (dimMode === 'heightWidth') {
      assist.height = primaryVal;
      values.height = primaryM;
    } else {
      assist.length = primaryVal;
      values.length = primaryM;
    }
    await persistCameraAssist(assist, values);
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

      {CAMERA_ASSIST_MEASUREMENT_ENABLED && !hasCameraAssist && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="flex flex-1 items-center gap-4 rounded-lg bg-muted/50 p-4">
            <Camera className="h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Camera assisted measurement</p>
              <p className="text-xs text-muted-foreground">
                Press and drag like a tape measure, set real size for area, then drag width — choose length×width or
                height×width.
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

      {CAMERA_ASSIST_MEASUREMENT_ENABLED && (
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
            {!manualExpanded && (
              <div>
                <Label className="text-xs text-muted-foreground">Measure area using</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={dimMode === 'lengthWidth' ? 'default' : 'outline'}
                    disabled={measureStep !== 'length' || !!activeDrag}
                    onClick={() => {
                      setDimMode('lengthWidth');
                      resetTapMeasure();
                    }}
                  >
                    Length × width
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={dimMode === 'heightWidth' ? 'default' : 'outline'}
                    disabled={measureStep !== 'length' || !!activeDrag}
                    onClick={() => {
                      setDimMode('heightWidth');
                      resetTapMeasure();
                    }}
                  >
                    Height × width
                  </Button>
                </div>
              </div>
            )}

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
                    className="absolute inset-0 z-10 cursor-crosshair touch-none"
                    onPointerDown={onOverlayPointerDown}
                    onPointerMove={onOverlayPointerMove}
                    onPointerUp={onOverlayPointerUp}
                    onPointerCancel={onOverlayPointerUp}
                  />
                  <TapeMeasureOverlay
                    width={overlaySize.w}
                    height={overlaySize.h}
                    primarySeg={primarySegComplete ? (primarySeg as Segment2D) : null}
                    widthSeg={widthSegComplete ? (widthSeg as Segment2D) : null}
                    activeDrag={activeDrag}
                    primaryLabel={primaryLineLabel}
                    widthLabel={widthLineLabel}
                    dragLabel={dragLineLabel}
                  />
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
                    onClick={undoLastMeasure}
                    disabled={!primarySeg && !widthSeg && !activeDrag}
                  >
                    Undo
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={resetTapMeasure}>
                    Reset
                  </Button>
                </div>

                {(measureStep === 'calibrate' || measureStep === 'width' || measureStep === 'ready') && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[140px] flex-1">
                      <Label htmlFor="tap-real-m">Real {primaryName.toLowerCase()} (m)</Label>
                      <Input
                        ref={realPrimaryInputRef}
                        id="tap-real-m"
                        type="number"
                        step="any"
                        min={0}
                        placeholder={
                          primarySegComplete
                            ? `Line shows px — enter real ${primaryName.toLowerCase()}`
                            : undefined
                        }
                        value={realPrimaryMStr}
                        onChange={(e) => setRealPrimaryMStr(e.target.value)}
                        onBlur={handleRealPrimaryBlur}
                        className="mt-1"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mb-0.5"
                      onClick={handleCalibratePrimary}
                      disabled={!primarySegComplete}
                    >
                      Apply scale
                    </Button>
                  </div>
                )}

                {tapPreview && measureStep === 'ready' && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                    <p className="font-medium text-foreground">Area measurement</p>
                    <p className="mt-1 text-muted-foreground">
                      {primaryName}: {tapPreview.primaryM.toFixed(2)} m · Width: {tapPreview.widthM.toFixed(2)} m ·
                      Area:{' '}
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={dimMode === 'lengthWidth' ? 'default' : 'outline'}
                    onClick={() => setDimMode('lengthWidth')}
                  >
                    Length × width
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={dimMode === 'heightWidth' ? 'default' : 'outline'}
                    onClick={() => setDimMode('heightWidth')}
                  >
                    Height × width
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {dimMode === 'lengthWidth' ? (
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
                  ) : (
                    <div>
                      <Label htmlFor="cam-ht">Height ({camUnit})</Label>
                      <Input
                        id="cam-ht"
                        type="number"
                        step="any"
                        min={0}
                        value={camHt}
                        onChange={(e) => setCamHt(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  )}
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
      )}

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
            {category.requiresInspection === false
              ? 'Provide complete issue details now. The provider will price from your submitted requirements.'
              : 'The provider will confirm exact requirements and provide a final quote after reviewing your request.'}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
