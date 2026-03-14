import type { Crop, StageLog, HarvestLog, CropData, CropDbAdjustment } from '../types';
import { generateId } from './ids';
import { parseDate, formatDateShort, daysBetween, addDays, today } from './dates';
import { getAdjustedValue, calculateHarvestDate } from './harvest';

export function processStageChange(
  crop: Crop,
  newStage: string,
  date: Date,
  cropData: CropData,
  adjustments: CropDbAdjustment[],
  existingHarvestLogs: HarvestLog[] = [],
  threshold = 3
): { updatedCrop: Crop; stageLog: StageLog; harvestLog?: HarvestLog } {
  const dateStr = formatDateShort(date);
  const stageLog: StageLog = {
    id: generateId('SL'),
    trackingId: crop.id,
    cropName: crop.cropName,
    variety: crop.variety,
    stageFrom: crop.plantStage,
    stageTo: newStage,
    date: dateStr,
    daysElapsed: 0,
    method: crop.plantingMethod,
    notes: '',
    syncStatus: 'pending',
    updatedAt: Date.now(),
  };

  const updatedCrop: Crop = {
    ...crop,
    plantStage: newStage,
    syncStatus: 'pending',
    updatedAt: Date.now(),
  };

  const planted = parseDate(crop.plantingDate);
  if (planted) {
    stageLog.daysElapsed = daysBetween(planted, date);
  }

  const key = crop.cropName.toLowerCase();

  if (newStage === 'Germinated') {
    updatedCrop.germinationDate = dateStr;
    if (planted) {
      updatedCrop.daysSeedGerm = daysBetween(planted, date);
    }
    // Recalculate transplant date from germination date
    const transplantDays = getAdjustedValue(key, 'transplant_days', cropData.transplant_days ?? 0, crop.variety, adjustments, threshold);
    if (transplantDays > 0) {
      updatedCrop.transplantDateScheduled = formatDateShort(addDays(date, transplantDays));
    }
    // Recalculate harvest date
    const newCropWithGerm = { ...updatedCrop };
    const harvestDate = calculateHarvestDate(newCropWithGerm, cropData, adjustments, threshold);
    if (harvestDate) updatedCrop.harvestDateEstimated = formatDateShort(harvestDate);
  }

  if (newStage === 'Transplanted') {
    updatedCrop.transplantDateActual = dateStr;
    const germDate = parseDate(crop.germinationDate);
    if (germDate) {
      updatedCrop.daysGermTransplant = daysBetween(germDate, date);
    }
    // Recalculate harvest from transplant
    const harvestDate = calculateHarvestDate({ ...updatedCrop }, cropData, adjustments, threshold);
    if (harvestDate) updatedCrop.harvestDateEstimated = formatDateShort(harvestDate);
  }

  let harvestLog: HarvestLog | undefined;
  if (newStage === 'Harvested') {
    updatedCrop.harvestDateActual = dateStr;
    if (!crop.isContinuous) {
      updatedCrop.status = 'Harvested';
    }
    const transplanted = parseDate(crop.transplantDateActual || crop.transplantDateScheduled);
    if (transplanted) {
      updatedCrop.daysTransplantHarvest = daysBetween(transplanted, date);
    }
    const estHarvest = parseDate(crop.harvestDateEstimated);
    const deviation = estHarvest ? daysBetween(estHarvest, date) : 0;
    const harvestCount = existingHarvestLogs.length + 1;
    harvestLog = {
      id: generateId('HL'),
      cropTrackingId: crop.id,
      cropName: crop.cropName,
      harvestNumber: harvestCount,
      harvestDate: dateStr,
      daysFromPlanting: planted ? daysBetween(planted, date) : 0,
      deviationFromDb: deviation,
      notes: '',
      syncStatus: 'pending',
      updatedAt: Date.now(),
    };
  }

  if (newStage === 'Deleted') {
    updatedCrop.status = 'Deleted';
  }

  return { updatedCrop, stageLog, harvestLog };
}

export const VALID_NEXT_STAGES: Record<string, string[]> = {
  Seed: ['Germinated', 'Seedling', 'Deleted'],
  Germinated: ['Seedling', 'Transplanted', 'Deleted'],
  Seedling: ['Vegetative', 'Transplanted', 'Deleted'],
  Vegetative: ['Flowering', 'Fruiting', 'Harvested', 'Deleted'],
  Flowering: ['Fruiting', 'Harvested', 'Deleted'],
  Fruiting: ['Harvested', 'Deleted'],
  Transplanted: ['Vegetative', 'Flowering', 'Fruiting', 'Harvested', 'Deleted'],
  Harvested: [],
  Deleted: [],
};

export const STAGE_COLORS: Record<string, string> = {
  Seed: '#9e9e9e',
  Germinated: '#aed581',
  Seedling: '#8bc34a',
  Vegetative: '#43a047',
  Flowering: '#ffb300',
  Fruiting: '#e65100',
  Transplanted: '#26a69a',
  Harvested: '#5d4037',
  Deleted: '#e53935',
};
