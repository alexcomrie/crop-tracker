import type { Crop, CropData, CropDbAdjustment } from '../types';
import { parseDate, addDays, formatDateShort, today } from './dates';
import { getAdjustedValue } from './harvest';

export function getConsistentPlantingDates(
  cropData: CropData,
  plantingDate: Date,
  monthsAhead = 3,
  variety: string,
  adjustments: CropDbAdjustment[]
): Date[] {
  const batchOffset = cropData.batch_offset_days ?? (cropData.growing_time_days / (cropData.number_of_weeks_harvest ?? 4));
  const endDate = addDays(today(), monthsAhead * 30);
  const dates: Date[] = [];
  let current = addDays(plantingDate, Math.round(batchOffset));
  while (current <= endDate) {
    dates.push(current);
    current = addDays(current, Math.round(batchOffset));
  }
  return dates;
}

export interface WeekGapData {
  start: Date;
  end: Date;
  crops: string[];
  hasHarvest: boolean;
}

export function buildSuccessionGapData(
  crops: Crop[],
  cropDb: Record<string, CropData>,
  weekCount = 12
): WeekGapData[] {
  const weeks: WeekGapData[] = [];
  const base = today();
  for (let i = 0; i < weekCount; i++) {
    const start = addDays(base, i * 7);
    const end = addDays(start, 6);
    const weekCrops: string[] = [];
    crops.filter(c => c.status === 'Active').forEach(crop => {
      const harvest = parseDate(crop.harvestDateEstimated);
      if (harvest && harvest >= start && harvest <= end) {
        weekCrops.push(`${crop.cropName}${crop.variety ? ' (' + crop.variety + ')' : ''}`);
      }
    });
    weeks.push({ start, end, crops: weekCrops, hasHarvest: weekCrops.length > 0 });
  }
  return weeks;
}
