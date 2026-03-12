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
  cropData: CropData,
  adjustments: CropDbAdjustment[],
  threshold = 3
): Date | null {
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

export function calculateTransplantDate(
  plantingDate: Date,
  germinationDate: Date | null,
  cropData: CropData,
  adjustments: CropDbAdjustment[],
  cropKey: string,
  variety: string,
  threshold = 3
): Date | null {
  const transplantDays = getAdjustedValue(
    cropKey, 'transplant_days',
    cropData.transplant_days ?? 0,
    variety, adjustments, threshold
  );
  if (transplantDays <= 0) return null;
  const base = germinationDate ?? plantingDate;
  return addDays(base, transplantDays);
}
