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
import { Sparkles, Check, Plus, Minus, AlertCircle, Package, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { estimateMeasurementsFromImages } from '@/lib/ai/estimates';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MeasurementCard } from '@/components/measurements/MeasurementCard';
import { calculateArea, toMeters } from '@/lib/measurements';
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
  const [captureReady, setCaptureReady] = useState(false);
  const capturedFileRef = useRef<File | null>(null);

  const [camUnit, setCamUnit] = useState<'m' | 'cm'>('m');
  const [dimMode, setDimMode] = useState<CameraAssistDimensionMode>('lengthWidth');
  const [camLen, setCamLen] = useState('');
  const [camWid, setCamWid] = useState('');
  const [camHt, setCamHt] = useState('');

  const hasCameraAssist = measurements.cameraAssist?.source === 'camera';

  const handleAIMeasurement = () => {
    setIsLoading(true);
    const aiMeasurements = estimateMeasurementsFromImages(images, category.id);
    setMeasurements(aiMeasurements);
    setIsLoading(false);
    toast({
      title: 'AI Measurements Ready',
      description: 'Review and adjust the estimated measurements as needed.',
    });
  };

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

  const previewAreaM2 = useMemo(() => {
    const w = parseFloat(camWid);
    if (!Number.isFinite(w) || w <= 0) return null;
    if (dimMode === 'lengthWidth') {
      const l = parseFloat(camLen);
      if (!Number.isFinite(l) || l <= 0) return null;
      const lM = toMeters(l, camUnit);
      const wM = toMeters(w, camUnit);
      if (lM === undefined || wM === undefined) return null;
      return calculateArea(lM, wM);
    }
    const h = parseFloat(camHt);
    if (!Number.isFinite(h) || h <= 0) return null;
    const hM = toMeters(h, camUnit);
    const wM = toMeters(w, camUnit);
    if (hM === undefined || wM === undefined) return null;
    return calculateArea(hM, wM);
  }, [camLen, camWid, camHt, camUnit, dimMode]);

  const resetDialogFields = () => {
    setCamLen('');
    setCamWid('');
    setCamHt('');
    setCamUnit('m');
    setDimMode('lengthWidth');
    setCaptureReady(false);
    capturedFileRef.current = null;
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

  const captureFrame = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) {
      toast({ title: 'Camera not ready', variant: 'destructive' });
      return;
    }
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    c.toBlob(
      (blob) => {
        if (!blob) return;
        capturedFileRef.current = new File([blob], `measure-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        setCaptureReady(true);
        toast({ title: 'Frame captured', description: 'Enter dimensions, then apply.' });
      },
      'image/jpeg',
      0.85
    );
  };

  const applyCameraMeasurements = async () => {
    if (!captureReady || !capturedFileRef.current) {
      toast({ title: 'Capture a frame first', variant: 'destructive' });
      return;
    }
    if (previewAreaM2 === null || previewAreaM2 < 0.5) {
      toast({
        title: 'Invalid measurement',
        description: 'Enter valid dimensions. Area must be at least 0.5 m².',
        variant: 'destructive',
      });
      return;
    }

    const width = parseFloat(camWid);
    if (!Number.isFinite(width) || width <= 0) {
      toast({ title: 'Width required', variant: 'destructive' });
      return;
    }

    let imageUrl: string | undefined;
    if (appendImageUrls) {
      try {
        const urls = await appendImageUrls([capturedFileRef.current], { appendToJobImages: false });
        imageUrl = urls[0];
      } catch (e) {
        toast({
          title: 'Upload failed',
          description: e instanceof Error ? e.message : 'Could not upload photo.',
          variant: 'destructive',
        });
        return;
      }
    }

    const areaM2 = previewAreaM2;
    const length = dimMode === 'lengthWidth' ? parseFloat(camLen) : undefined;
    const height = dimMode === 'heightWidth' ? parseFloat(camHt) : undefined;

    const cameraAssist: CameraAssistMeasurement = {
      type: 'area',
      unit: camUnit,
      dimensionMode: dimMode,
      width,
      source: 'camera',
      area: areaM2,
      ...(imageUrl ? { imageUrl } : {}),
      ...(length !== undefined && Number.isFinite(length) ? { length } : {}),
      ...(height !== undefined && Number.isFinite(height) ? { height } : {}),
    };

    const widthM = toMeters(width, camUnit)!;
    const values: Record<string, number> = {
      width: widthM,
      area: areaM2,
    };
    if (dimMode === 'lengthWidth') {
      const l = parseFloat(camLen);
      const lM = toMeters(l, camUnit)!;
      values.length = lM;
    } else {
      const h = parseFloat(camHt);
      const hM = toMeters(h, camUnit)!;
      values.height = hM;
    }

    setMeasurements({
      ...measurements,
      source: 'MANUAL',
      values: { ...measurements.values, ...values },
      cameraAssist,
    });

    setCameraOpen(false);
    resetDialogFields();
    toast({
      title: 'Camera measurement saved',
      description: `Area ${areaM2.toFixed(2)} m² — visible to your provider.`,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Measurements</h2>
        <p className="text-muted-foreground">Enter or estimate the measurements for your task</p>
      </div>

      {!hasCameraAssist && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="flex flex-1 items-center gap-4 rounded-lg bg-muted/50 p-4">
            <Sparkles className="h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Use AI Estimation</p>
              <p className="text-xs text-muted-foreground">Analyze uploaded images to estimate measurements</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleAIMeasurement}
              disabled={images.length === 0 || isLoading}
            >
              {isLoading ? 'Analyzing...' : 'Estimate'}
            </Button>
          </div>
          <div className="flex flex-1 items-center gap-4 rounded-lg bg-muted/50 p-4">
            <Camera className="h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Use Camera Measurement</p>
              <p className="text-xs text-muted-foreground">Capture a photo, then enter length × width or height × width</p>
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
            <DialogTitle>Camera measurement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            </div>
            <canvas ref={canvasRef} className="hidden" />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={captureFrame}>
                Capture image
              </Button>
              {captureReady && (
                <span className="self-center text-xs text-muted-foreground">Image ready — set units and dimensions</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs font-medium text-muted-foreground self-center">Unit:</span>
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
              <span className="text-xs font-medium text-muted-foreground self-center">Mode:</span>
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
                {previewAreaM2 !== null ? `${previewAreaM2.toFixed(2)} m²` : '—'}
              </span>
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCameraOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void applyCameraMeasurements()} disabled={!captureReady}>
              Save measurement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {measurements.source === 'AI' && !hasCameraAssist && (
        <div className="flex items-center gap-2 text-sm text-success">
          <Check className="h-4 w-4" />
          AI estimates applied. You can adjust values below.
        </div>
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
            The provider will confirm exact requirements and provide a final quote after reviewing your request.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
