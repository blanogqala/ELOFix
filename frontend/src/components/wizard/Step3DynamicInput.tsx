import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Category, Measurements, MovingItem, PlumbingIssue } from '@/types';
import { 
  Sparkles, 
  Check, 
  Plus, 
  Minus, 
  X,
  AlertCircle,
  Package,
  Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { estimateMeasurementsFromImages } from '@/lib/ai/estimates';

interface Step3DynamicInputProps {
  category: Category;
  measurements: Measurements;
  setMeasurements: (m: Measurements) => void;
  images: string[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function Step3DynamicInput({
  category,
  measurements,
  setMeasurements,
  images,
  isLoading,
  setIsLoading
}: Step3DynamicInputProps) {
  const { toast } = useToast();
  const [otherItemName, setOtherItemName] = useState('');
  const [otherItemWeight, setOtherItemWeight] = useState('');

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

  // MEASUREMENTS TYPE (Tiling, Roofing, Construction, Cleaning, Gardening)
  if (category.step3Type === 'measurements') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Measurements</h2>
          <p className="text-muted-foreground">Enter or estimate the measurements for your task</p>
        </div>

        {/* AI Toggle */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <Sparkles className="h-5 w-5 text-accent" />
          <div className="flex-1">
            <p className="font-medium text-sm">Use AI Estimation</p>
            <p className="text-xs text-muted-foreground">Let AI analyze your images to estimate measurements</p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleAIMeasurement}
            disabled={images.length === 0 || isLoading}
          >
            {isLoading ? 'Analyzing...' : 'Estimate'}
          </Button>
        </div>

        {measurements.source === 'AI' && (
          <div className="text-sm text-success flex items-center gap-2">
            <Check className="h-4 w-4" />
            AI estimates applied. You can adjust values below.
          </div>
        )}

        {/* Measurement Fields */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="area">Area (sqm)</Label>
            <Input
              id="area"
              type="number"
              placeholder="e.g., 15"
              value={measurements.values.area || ''}
              onChange={(e) => setMeasurements({
                ...measurements,
                source: 'MANUAL',
                values: { ...measurements.values, area: parseFloat(e.target.value) || 0 }
              })}
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
              onChange={(e) => setMeasurements({
                ...measurements,
                source: 'MANUAL',
                values: { ...measurements.values, length: parseFloat(e.target.value) || 0 }
              })}
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
              onChange={(e) => setMeasurements({
                ...measurements,
                source: 'MANUAL',
                values: { ...measurements.values, width: parseFloat(e.target.value) || 0 }
              })}
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
              onChange={(e) => setMeasurements({
                ...measurements,
                source: 'MANUAL',
                values: { ...measurements.values, height: parseFloat(e.target.value) || 0 }
              })}
              className="mt-1"
            />
          </div>
        </div>
      </div>
    );
  }

  // ITEMS TYPE (Moving)
  if (category.step3Type === 'items') {
    const movingItems = measurements.movingItems || [];

    const updateItemQty = (itemId: string, delta: number) => {
      const existing = movingItems.find(i => i.id === itemId);
      if (existing) {
        const newQty = Math.max(0, existing.qty + delta);
        if (newQty === 0) {
          setMeasurements({
            ...measurements,
            movingItems: movingItems.filter(i => i.id !== itemId),
          });
        } else {
          setMeasurements({
            ...measurements,
            movingItems: movingItems.map(i => 
              i.id === itemId ? { ...i, qty: newQty } : i
            ),
          });
        }
      } else {
        const commonItem = category.commonItems?.find(ci => ci.id === itemId);
        if (commonItem) {
          setMeasurements({
            ...measurements,
            movingItems: [...movingItems, {
              id: itemId,
              name: commonItem.name,
              qty: 1,
              weight: commonItem.defaultWeight,
            }],
          });
        }
      }
    };

    const addOtherItem = () => {
      if (!otherItemName.trim()) return;
      
      setMeasurements({
        ...measurements,
        movingItems: [...movingItems, {
          id: `other-${Date.now()}`,
          name: otherItemName,
          qty: 1,
          weight: parseFloat(otherItemWeight) || undefined,
          description: 'Custom item',
        }],
      });
      setOtherItemName('');
      setOtherItemWeight('');
    };

    const getItemQty = (itemId: string) => {
      return movingItems.find(i => i.id === itemId)?.qty || 0;
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">What are you moving?</h2>
          <p className="text-muted-foreground">Select items and quantities to help us estimate your move</p>
        </div>

        {/* Common Items Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {category.commonItems?.map(item => {
            const qty = getItemQty(item.id);
            return (
              <div 
                key={item.id}
                className={cn(
                  "p-4 rounded-lg border transition-colors",
                  qty > 0 ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{item.icon}</span>
                  {qty > 0 && (
                    <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                      {qty}
                    </span>
                  )}
                </div>
                <p className="font-medium text-sm mb-2">{item.name}</p>
                <div className="flex items-center gap-2">
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-7 w-7"
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
                    onClick={() => updateItemQty(item.id, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Other Items */}
        <div className="border-t border-border pt-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
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
            <Button onClick={addOtherItem} disabled={!otherItemName.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Custom Items List */}
        {movingItems.filter(i => i.description === 'Custom item').length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Custom Items</h4>
            {movingItems
              .filter(i => i.description === 'Custom item')
              .map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{item.name}</p>
                    {item.weight && (
                      <p className="text-xs text-muted-foreground">Est. weight: {item.weight}kg</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="h-7 w-7"
                      onClick={() => updateItemQty(item.id, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm">{item.qty}</span>
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="h-7 w-7"
                      onClick={() => updateItemQty(item.id, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Summary */}
        {movingItems.length > 0 && (
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="font-medium">Moving Summary</p>
            <p className="text-sm text-muted-foreground">
              {movingItems.reduce((sum, i) => sum + i.qty, 0)} items • 
              Est. {movingItems.reduce((sum, i) => sum + (i.weight || 20) * i.qty, 0)}kg total
            </p>
          </div>
        )}
      </div>
    );
  }

  // ISSUE TYPE (Plumbing, Electrical, Sewing)
  if (category.step3Type === 'issue') {
    const plumbingIssue = measurements.plumbingIssue || { type: '', description: '' };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Describe the Issue</h2>
          <p className="text-muted-foreground">Help us understand what needs to be done</p>
        </div>

        {/* Issue Type Selection */}
        <div>
          <Label className="mb-2 block">What type of issue is this?</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {category.issueTypes?.map(type => (
              <button
                key={type}
                onClick={() => setMeasurements({
                  ...measurements,
                  plumbingIssue: { ...plumbingIssue, type },
                  values: { ...measurements.values, issueType: 1 },
                })}
                className={cn(
                  "p-3 rounded-lg border text-sm font-medium transition-colors text-left",
                  plumbingIssue.type === type 
                    ? "border-primary bg-primary/5 text-primary" 
                    : "border-border hover:border-primary/30"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <Label htmlFor="issue-desc">Describe the problem in detail</Label>
          <Textarea
            id="issue-desc"
            placeholder={`Describe the ${category.name.toLowerCase()} issue you're experiencing...`}
            value={plumbingIssue.description}
            onChange={(e) => setMeasurements({
              ...measurements,
              plumbingIssue: { ...plumbingIssue, description: e.target.value },
            })}
            className="mt-1"
            rows={4}
          />
        </div>

        {/* Photo Upload (optional) */}
        <div>
          <Label className="mb-2 block">Upload a photo of the issue (optional)</Label>
          <div 
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => {
              toast({
                title: 'Not implemented',
                description: 'Issue photo upload endpoint is not implemented in the backend yet.',
                variant: 'destructive',
              });
            }}
          >
            <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Click to upload a photo</p>
          </div>
          {plumbingIssue.photo && (
            <div className="mt-2 relative inline-block">
              <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Photo</span>
              </div>
              <button
                onClick={() => setMeasurements({
                  ...measurements,
                  plumbingIssue: { ...plumbingIssue, photo: undefined },
                })}
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Note */}
        <div className="flex items-start gap-2 p-4 bg-muted/50 rounded-lg">
          <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            The provider will confirm exact requirements and provide a final quote after reviewing your request.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
