import type { Crop, CropData, CropDbAdjustment } from '../types';
import { parseDate, addDays } from './dates';

export function getAdjustedValue(
  cropKey: string,
  field: string,
  defaultVal: number,
  variety: string,
  adjustments: CropDbAdjustment[],
  threshold = 3
): number {
  const adj = adjustments.find(
    a => a.cropKey === cropKey.toLowerCase() &&
      (a.variety === variety || a.variety === '') &&
      a.field === field &&
      a.useCustom === 'Yes' &&
      a.sampleCount >= threshold
  );
  return adj ? adj.yourAverage : defaultVal;
}

export function calculateHarvestDate(
  crop: Crop,
  cropData: CropData | null,
  adjustments: CropDbAdjustment[],
  threshold = 3
): Date | null {
  // No foundation data (custom crop / DB not loaded): no estimate to compute
  if (!cropData) return null;
  const key = crop.cropName.toLowerCase();
  const growFromTransplant = getAdjustedValue(
    key, 'growing_from_transplant',
    cropData.growing_from_transplant ?? cropData.growing_time_days,
    crop.variety, adjustments, threshold
  );
  const growTime = getAdjustedValue(
    key, 'growing_time_days',
    cropData.growing_time_days,
    crop.variety, adjustments, threshold
  );

  if (crop.transplantDateActual) {
    const d = parseDate(crop.transplantDateActual);
    if (d) return addDays(d, growFromTransplant);
  }
  if (crop.transplantDateScheduled) {
    const d = parseDate(crop.transplantDateScheduled);
    if (d) return addDays(d, growFromTransplant);
  }
  const planted = parseDate(crop.plantingDate);
  if (planted) return addDays(planted, growTime);
  return null;
}

/**
 * Median gap in days between consecutive harvest dates. Used to learn a
 * continuous crop's actual harvest cadence from its harvest logs.
 * Returns null when fewer than 2 valid dates are available.
 */
export function medianHarvestGapDays(harvestDates: Date[]): number | null {
  const valid = harvestDates.filter(d => d instanceof Date && !isNaN(d.getTime()));
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const g = Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000);
    if (g > 0) gaps.push(g);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

export function calculateTransplantDate(
  plantingDate: Date,
  germinationDate: Date | null,
  cropData: CropData | null,
  adjustments: CropDbAdjustment[],
  cropKey: string,
  variety: string,
  threshold = 3
): Date | null {
  if (!cropData) return null;
  const transplantDays = getAdjustedValue(
    cropKey, 'transplant_days',
    cropData.transplant_days ?? 0,
    variety, adjustments, threshold
  );
  if (transplantDays <= 0) return null;
  const base = germinationDate ?? plantingDate;
  return addDays(base, transplantDays);
}
