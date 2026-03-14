import type { PropDbAdjustment, CropDatabase } from '../types';
import { resolveCropData } from './cropDb';

export const PROPAGATION_DEFAULTS: Record<string, { min: number; max: number }> = {
  Cutting: { min: 14, max: 28 },
  Seed: { min: 5, max: 14 },
  Division: { min: 7, max: 14 },
  Layering: { min: 21, max: 42 },
  Grafting: { min: 14, max: 28 },
};

export function getRootingDays(
  plantKey: string,
  method: string,
  propAdjustments: PropDbAdjustment[],
  cropDb?: CropDatabase
): { min: number; max: number } {
  const adj = propAdjustments.find(
    a => a.plantKey === plantKey.toLowerCase() && a.method === method && a.useCustom === 'Yes'
  );
  if (adj) {
    const avg = adj.yourAverage;
    return { min: Math.round(avg * 0.8), max: Math.round(avg * 1.2) };
  }
  // Inherit from Crop DB for seeds if available
  if (method === 'Seed' && cropDb) {
    const cd = resolveCropData(cropDb, plantKey);
    if (cd) {
      return { min: cd.germination_days_min, max: cd.germination_days_max };
    }
  }
  return PROPAGATION_DEFAULTS[method] ?? { min: 14, max: 28 };
}
