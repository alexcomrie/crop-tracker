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
    updatedAt: Date.now(),
  };

  const updatedCrop: Crop = {
    ...crop,
    plantStage: newStage,
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
    
    // Continuous Harvest Promotion Logic
    if (crop.isContinuous) {
      // The original crop is removed, and batches are promoted.
      // This logic will be handled in the component calling processStageChange 
      // or we can add a flag here.
      updatedCrop.status = 'Harvested'; // It will be removed from tracker by the caller
    } else {
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
      updatedAt: Date.now(),
    };
  }

  if (newStage === 'Deleted') {
    updatedCrop.status = 'Deleted';
  }

  if (newStage === 'Grafting') {
    updatedCrop.status = 'Healing';
  }

  if (newStage === 'Healing') {
    updatedCrop.status = 'Healing';
  } else if (newStage !== 'Harvested' && newStage !== 'Deleted' && newStage !== 'Grafting') {
    updatedCrop.status = 'Active';
  }

  return { updatedCrop, stageLog, harvestLog };
}

export const VALID_NEXT_STAGES: Record<string, string[]> = {
  Seed: ['Germinated', 'Grafting', 'Deleted'],
  Germinated: ['Seedling', 'Grafting', 'Deleted'],
  Grafting: ['Healing', 'Deleted'],
  Healing: ['Seedling', 'Transplanted', 'Deleted'],
  Seedling: ['Transplanted', 'Grafting', 'Flowering', 'Deleted'],
  Transplanted: ['Flowering', 'Deleted'],
  Flowering: ['Ready to Harvest', 'Deleted'],
  'Ready to Harvest': ['Harvested', 'Deleted'],
  Harvested: [],
  Deleted: [],
};

export const STAGE_COLORS: Record<string, string> = {
  Seed: '#9e9e9e',
  Germinated: '#aed581',
  Grafting: '#7e57c2',
  Healing: '#ba68c8',
  Seedling: '#8bc34a',
  Transplanted: '#26a69a',
  Flowering: '#ffb300',
  'Ready to Harvest': '#e65100',
  Harvested: '#5d4037',
  Deleted: '#e53935',
};

const VINE_FAMILY = ['watermelon', 'melon', 'pumpkin', 'cucumber', 'squash', 'zucchini', 'gourd', 'cantaloupe'];

export function isVineFamily(cropName: string, plantType?: string): boolean {
  const name = cropName.toLowerCase();
  const type = (plantType || '').toLowerCase();
  const isVineName = VINE_FAMILY.some(v => name.includes(v));
  const isVineType = type.includes('vine');
  return isVineName || isVineType;
}

/** 
 * Promotes the next batch to be the "original" and shifts others.
 */
export async function promoteNextBatch(harvestedCrop: Crop, db: any) {
  // 1. Get all batches associated with this parent (or if this is a parent itself)
  const parentId = harvestedCrop.parentCropId || harvestedCrop.id;
  const batches = await db.crops
    .where('parentCropId')
    .equals(parentId)
    .and((c: Crop) => c.status === 'Active')
    .toArray();
    
  if (batches.length === 0) return;

  // 2. Sort batches by batch number
  batches.sort((a: Crop, b: Crop) => a.batchNumber - b.batchNumber);

  // 3. Promote the first batch in the list
  const nextParent = batches[0];
  const originalName = harvestedCrop.cropName.split(' [Batch')[0];
  
  await db.crops.update(nextParent.id, {
    cropName: originalName,
    parentCropId: undefined, // Now it's the new original
    batchNumber: 1, // Becomes the first
    updatedAt: Date.now()
  });

  // 4. Update the subsequent batches to point to the new parent and shift their numbers
  for (let i = 1; i < batches.length; i++) {
    const batch = batches[i];
    await db.crops.update(batch.id, {
      parentCropId: nextParent.id,
      batchNumber: i + 1,
      cropName: `${originalName} [Batch ${i + 1}]`,
      updatedAt: Date.now()
    });
  }
}

/** If transplant is scheduled, not yet done, and overdue, move schedule to today */
export function autoAdjustTransplantSchedule(crop: Crop, cropData: CropData | null): Crop | null {
  if (!crop.transplantDateScheduled || crop.transplantDateActual) return null;
  const sched = parseDate(crop.transplantDateScheduled);
  const now = today();
  if (!sched) return null;
  if (sched < now) {
    const updated: Crop = { ...crop, transplantDateScheduled: formatDateShort(now), updatedAt: Date.now() };
    return updated;
  }
  return null;
}
