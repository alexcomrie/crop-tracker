import type { CropDbAdjustment, PropDbAdjustment } from '../types';
import { generateId } from './ids';
import { formatDateShort, today } from './dates';

export function logDeviation(
  cropKey: string,
  field: string,
  dbDefault: number,
  actualValue: number,
  variety: string,
  adjustments: CropDbAdjustment[],
  threshold = 3
): CropDbAdjustment {
  const existing = adjustments.find(
    a => a.cropKey === cropKey.toLowerCase() && a.field === field && a.variety === variety
  );
  const now = formatDateShort(today());
  if (existing) {
    const newCount = existing.sampleCount + 1;
    const newAvg = (existing.yourAverage * existing.sampleCount + actualValue) / newCount;
    return {
      ...existing,
      yourAverage: Math.round(newAvg * 10) / 10,
      sampleCount: newCount,
      useCustom: newCount >= threshold ? 'Yes' : existing.useCustom,
      lastUpdated: now,
      syncStatus: 'pending',
      updatedAt: Date.now(),
    };
  }
  return {
    id: generateId('CA'),
    cropKey: cropKey.toLowerCase(),
    variety,
    field,
    databaseDefault: dbDefault,
    yourAverage: actualValue,
    sampleCount: 1,
    useCustom: 'No',
    lastUpdated: now,
    syncStatus: 'pending',
    updatedAt: Date.now(),
  };
}

export function updatePropDatabase(
  plantKey: string,
  method: string,
  daysToRoot: number,
  adjustments: PropDbAdjustment[],
  threshold = 3
): PropDbAdjustment {
  const existing = adjustments.find(
    a => a.plantKey === plantKey.toLowerCase() && a.method === method
  );
  const now = formatDateShort(today());
  if (existing) {
    const newCount = existing.sampleCount + 1;
    const newAvg = (existing.yourAverage * existing.sampleCount + daysToRoot) / newCount;
    return {
      ...existing,
      yourAverage: Math.round(newAvg * 10) / 10,
      sampleCount: newCount,
      useCustom: newCount >= threshold ? 'Yes' : existing.useCustom,
      lastUpdated: now,
      syncStatus: 'pending',
      updatedAt: Date.now(),
    };
  }
  return {
    id: generateId('PA'),
    plantKey: plantKey.toLowerCase(),
    method,
    dbDefaultRootingDays: daysToRoot,
    yourAverage: daysToRoot,
    sampleCount: 1,
    useCustom: 'No',
    lastUpdated: now,
    syncStatus: 'pending',
    updatedAt: Date.now(),
  };
}
