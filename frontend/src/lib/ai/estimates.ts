// AI Module - Stubs for MVP
// These functions simulate AI outputs. Replace with real AI calls later.

import { Measurements, MaterialLine, Product, Provider, ProviderLaborPricingEntry } from '@/types';

/**
 * Simulate AI-based measurement estimation from images
 * In production, this would analyze uploaded images to extract measurements
 */
export function estimateMeasurementsFromImages(
  images: string[],
  category: string
): Measurements {
  // Simulated AI output based on category
  const baseValues: Record<string, Record<string, number>> = {
    tiling: { area: 15, length: 5, width: 3 },
    roofing: { area: 80, slope: 30 },
    plumbing: { pipes: 10, fixtures: 3 },
    electrical: { circuits: 4, outlets: 12, length: 50 },
    construction: { area: 100, height: 3 },
    cleaning: { area: 120, rooms: 4 },
    gardening: { area: 200, beds: 6 },
  };

  // Add some randomness to simulate different scenarios
  const categoryValues = baseValues[category] || { area: 20 };
  const adjustedValues: Record<string, number> = {};
  
  Object.entries(categoryValues).forEach(([key, value]) => {
    // Add ±20% variation
    const variation = 0.8 + Math.random() * 0.4;
    adjustedValues[key] = Math.round(value * variation);
  });

  return {
    source: 'AI',
    values: adjustedValues,
  };
}

/**
 * Estimate materials needed based on category and measurements
 */
export function estimateMaterials(
  category: string,
  measurements: Record<string, number>,
  qualityTier: 'low' | 'medium' | 'high',
  availableProducts: Array<Product & { supplierId: string; supplierName: string }>
): MaterialLine[] {
  const materials: MaterialLine[] = [];
  
  // Filter products by quality tier
  const filteredProducts = availableProducts.filter(p => p.qualityTier === qualityTier);
  
  if (filteredProducts.length === 0) return materials;

  // Simple estimation logic based on category
  const area = measurements.area || measurements.length * (measurements.width || 1) || 10;
  
  filteredProducts.slice(0, 3).forEach(product => {
    let qty = 1;
    
    if (product.unit === 'sqm') {
      qty = Math.ceil(area * 1.1); // 10% waste allowance
    } else if (product.unit === 'meter') {
      qty = Math.ceil((measurements.length || area) * 1.1);
    } else if (product.unit === 'bag') {
      qty = Math.ceil(area / 5);
    } else if (product.unit === 'piece') {
      qty = Math.ceil(area * 50); // e.g., bricks
    }
    
    materials.push({
      supplierId: product.supplierId,
      supplierName: product.supplierName,
      productId: product.id,
      name: product.name,
      qty,
      unitPrice: product.price,
      qualityTier: product.qualityTier,
      unit: product.unit,
    });
  });
  
  return materials;
}

/**
 * Recommend providers based on category, skills, and pricing
 */
export function recommendProviders(
  category: string,
  providers: Provider[],
  measurements: Record<string, number>
): Provider[] {
  // Filter providers who have the required skill
  const eligible = providers.filter(p => 
    p.approved && p.skills.includes(category)
  );
  
  // Score providers based on multiple factors
  const scored = eligible.map(provider => {
    let score = 0;
    
    // Rating weight: 0-5 → 0-50 points
    score += provider.rating * 10;
    
    // Experience weight: completed jobs (max 30 points)
    score += Math.min(provider.completedJobs / 10, 30);
    
    // Response time weight (max 20 points)
    if (provider.responseTime.includes('min')) score += 20;
    else if (provider.responseTime.includes('1 hour')) score += 15;
    else if (provider.responseTime.includes('2 hour')) score += 10;
    else score += 5;
    
    return { provider, score };
  });
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  return scored.map(s => s.provider);
}

/**
 * Generate a quote range for a job
 */
export function generateQuote(
  category: string,
  materials: MaterialLine[],
  providerPricing: Record<string, ProviderLaborPricingEntry>,
  measurements: Record<string, number>
): { materialsRange: { min: number; max: number }; laborRange: { min: number; max: number }; totalRange: { min: number; max: number } } {
  // Calculate materials cost
  const materialsTotal = materials.reduce((sum, m) => sum + (m.qty * m.unitPrice), 0);
  const materialsMin = materialsTotal * 0.95;
  const materialsMax = materialsTotal * 1.05;

  // Calculate labour (prefer whole-job ZAR range when present)
  const pricing = providerPricing[category];
  let laborBase = 0;
  let laborSpan = { minMul: 0.9, maxMul: 1.1 };

  if (pricing) {
    const low = pricing.jobFeeLow != null ? Number(pricing.jobFeeLow) : Number.NaN;
    const high = pricing.jobFeeHigh != null ? Number(pricing.jobFeeHigh) : Number.NaN;

    if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0 && low <= high) {
      return {
        materialsRange: { min: Math.round(materialsMin), max: Math.round(materialsMax) },
        laborRange: { min: Math.round(low * 0.95), max: Math.round(high * 1.05) },
        totalRange: {
          min: Math.round(materialsMin + low * 0.95),
          max: Math.round(materialsMax + high * 1.05),
        },
      };
    }

    laborBase = Number(pricing.rate || 0) || 0;

    if (pricing.unit === 'sqm' && measurements.area) {
      laborBase *= measurements.area;
    } else if (pricing.unit === 'hour') {
      const estimatedHours = Math.ceil((measurements.area || 10) / 5);
      laborBase *= estimatedHours;
    }
  }

  if (laborBase <= 0 || !pricing) {
    laborBase = (measurements.area || 10) * 25;
    laborSpan = { minMul: 0.9, maxMul: 1.1 };
  }

  const laborMin = laborBase * laborSpan.minMul;
  const laborMax = laborBase * laborSpan.maxMul;

  return {
    materialsRange: { min: Math.round(materialsMin), max: Math.round(materialsMax) },
    laborRange: { min: Math.round(laborMin), max: Math.round(laborMax) },
    totalRange: {
      min: Math.round(materialsMin + laborMin),
      max: Math.round(materialsMax + laborMax),
    },
  };
}
