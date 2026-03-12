import type { PropDbAdjustment } from '../types';

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
  propAdjustments: PropDbAdjustment[]
): { min: number; max: number } {
  const adj = propAdjustments.find(
    a => a.plantKey === plantKey.toLowerCase() && a.method === method && a.useCustom === 'Yes'
  );
  if (adj) {
    const avg = adj.yourAverage;
    return { min: Math.round(avg * 0.8), max: Math.round(avg * 1.2) };
  }
  return PROPAGATION_DEFAULTS[method] ?? { min: 14, max: 28 };
}
