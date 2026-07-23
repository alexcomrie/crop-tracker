import type { Crop, StageLog, HarvestLog, CropData, CropDbAdjustment } from '../types';
import { generateId } from './ids';
import { parseDate, formatDateShort, daysBetween, addDays, today } from './dates';
import { getAdjustedValue, calculateHarvestDate } from './harvest';
import { addDiaryEntry } from './diary';

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
    if (planted) updatedCrop.daysSeedGerm = daysBetween(planted, date);
    const transplantDays = getAdjustedValue(key, 'transplant_days', cropData.transplant_days ?? 0, crop.variety, adjustments, threshold);
    if (transplantDays > 0) updatedCrop.transplantDateScheduled = formatDateShort(addDays(date, transplantDays));
    const newCropWithGerm = { ...updatedCrop };
    const harvestDate = calculateHarvestDate(newCropWithGerm, cropData, adjustments, threshold);
    if (harvestDate) updatedCrop.harvestDateEstimated = formatDateShort(harvestDate);
  }

  if (newStage === 'Transplanted') {
    updatedCrop.transplantDateActual = dateStr;
    const germDate = parseDate(crop.germinationDate);
    if (germDate) updatedCrop.daysGermTransplant = daysBetween(germDate, date);
    const harvestDate = calculateHarvestDate({ ...updatedCrop }, cropData, adjustments, threshold);
    if (harvestDate) updatedCrop.harvestDateEstimated = formatDateShort(harvestDate);
  }

  let harvestLog: HarvestLog | undefined;
  if (newStage === 'Harvested') {
    updatedCrop.harvestDateActual = dateStr;
    updatedCrop.status = 'Harvested';
    const transplanted = parseDate(crop.transplantDateActual || crop.transplantDateScheduled);
    if (transplanted) updatedCrop.daysTransplantHarvest = daysBetween(transplanted, date);
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

  if (newStage === 'Deleted') updatedCrop.status = 'Deleted';
  if (newStage !== 'Harvested' && newStage !== 'Deleted') updatedCrop.status = 'Active';

  return { updatedCrop, stageLog, harvestLog };
}

export function getPlantType(cropData: CropData | null): 'fruit' | 'leafy' | 'other' {
  if (!cropData) return 'other';
  const t = (cropData.plant_type || '').toLowerCase();
  if (t.includes('fruit') || t.includes('vine') || t.includes('legume') || t.includes('grain')) return 'fruit';
  if (t.includes('leaf') || t.includes('brassica') || t.includes('herb') || t.includes('bulb') || t.includes('rhizome')) return 'leafy';
  return 'other';
}

export function getStageSequence(cropData: CropData | null): string[] {
  const type = getPlantType(cropData);
  if (type === 'fruit') return ['Seed', 'Germinated', 'Seedling', 'Vegetative', 'Flowering', 'Fruiting', 'Harvested'];
  if (type === 'leafy') return ['Seed', 'Germinated', 'Seedling', 'Middle Vegetative', 'Final Vegetative', 'Harvested'];
  return ['Seed', 'Germinated', 'Seedling', 'Vegetative', 'Harvested'];
}

export function getValidNextStages(currentStage: string, cropData: CropData | null, plantingMethod?: string): string[] {
  const seq = getStageSequence(cropData);
  const result = seq.filter(s => s !== currentStage);

  if (currentStage === 'Grafting') {
    result.push('Healing');
  }
  if (currentStage === 'Healing') {
    if (!result.includes('Seedling')) result.push('Seedling');
    if (!result.includes('Transplanted')) result.push('Transplanted');
  }
  if (currentStage === 'Seedling') {
    const isTrayOrBed = plantingMethod === 'Seed Tray' || plantingMethod === 'Seed Bed';
    const isPot = plantingMethod === 'Pot';
    const hasTransplant = cropData && cropData.transplant_days != null && cropData.transplant_days > 0;
    if (isTrayOrBed) {
      result.push('Up-planted');
    } else if (isPot || hasTransplant) {
      result.push('Transplanted');
    }
  }
  if (currentStage === 'Up-planted') {
    if (!result.includes('Transplanted')) result.push('Transplanted');
  }
  if (!seq.includes(currentStage) && !['Grafting', 'Healing', 'Transplanted', 'Up-planted'].includes(currentStage)) {
    if (!result.includes('Harvested')) result.push('Harvested');
  }
  if (currentStage !== 'Deleted') result.push('Deleted');

  return result;
}

export function getStagesForCrop(cropData: CropData | null): string[] {
  return getStageSequence(cropData).filter(s => s !== 'Seed');
}

export function getFilterStages(cropData: CropData | null): string[] {
  const seq = getStageSequence(cropData);
  return seq.filter(s => s !== 'Seed').concat(['Active']);
}

export function getStageIndex(stage: string, seq: string[]): number {
  return seq.indexOf(stage);
}

/** Calculate which stage the crop should be in based on time since germination */
export function calcExpectedStage(crop: Crop, cropData: CropData | null): string | null {
  if (!cropData) return null;

  // If germination hasn't been confirmed yet, stay at Seed (must be manual)
  if (!crop.germinationDate) return 'Seed';

  const germDate = parseDate(crop.germinationDate);
  if (!germDate) return 'Seed';

  const daysSinceGerm = daysBetween(germDate, today());
  const totalDays = cropData.growing_time_days || 60;

  // At Germinated stage: wait 7 days before auto-transitioning to Seedling
  if (crop.plantStage === 'Germinated') {
    if (daysSinceGerm < 7) return 'Germinated';
    return 'Seedling';
  }

  if (daysSinceGerm >= totalDays) return 'Harvested';

  // For tray/bed/pot/transplant crops waiting at Seedling
  const isTrayOrBed = crop.plantingMethod === 'Seed Tray' || crop.plantingMethod === 'Seed Bed';
  const isPot = crop.plantingMethod === 'Pot';
  const needsManual = isTrayOrBed || isPot || (cropData.transplant_days || 0) > 0;
  if (needsManual && !crop.transplantDateActual && crop.plantStage === 'Seedling') {
    return 'Seedling';
  }

  // Calculate proportion based on days since germination (minus 7-day germ period)
  const adjustedDays = Math.max(0, daysSinceGerm - 7);
  const remainingDays = Math.max(1, totalDays - 7);
  const pct = adjustedDays / remainingDays;

  const type = getPlantType(cropData);

  if (type === 'fruit') {
    if (pct <= 0.3) return 'Seedling';
    if (pct <= 0.5) return 'Vegetative';
    if (pct <= 0.65) return 'Flowering';
    return 'Fruiting';
  }
  if (type === 'leafy') {
    if (pct <= 0.3) return 'Seedling';
    if (pct <= 0.55) return 'Middle Vegetative';
    return 'Final Vegetative';
  }
  if (pct <= 0.4) return 'Seedling';
  if (pct <= 0.7) return 'Vegetative';
  return 'Harvested';
}

export const STAGE_COLORS: Record<string, string> = {
  Seed: '#9e9e9e',
  Germinated: '#aed581',
  Seedling: '#8bc34a',
  'Middle Vegetative': '#66bb6a',
  'Final Vegetative': '#43a047',
  Vegetative: '#66bb6a',
  Flowering: '#ffb300',
  Fruiting: '#f57c00',
  'Up-planted': '#78909c',
  Transplanted: '#26a69a',
  Grafting: '#7e57c2',
  Healing: '#ba68c8',
  Harvested: '#5d4037',
  Deleted: '#e53935',
};

const VINE_FAMILY = ['watermelon', 'melon', 'pumpkin', 'cucumber', 'squash', 'zucchini', 'gourd', 'cantaloupe'];

export function isVineFamily(cropName: string, plantType?: string): boolean {
  const name = cropName.toLowerCase();
  const type = (plantType || '').toLowerCase();
  return VINE_FAMILY.some(v => name.includes(v)) || type.includes('vine');
}

/** Auto-transition a crop to the expected stage, recording stage logs */
export async function autoTransitionCrop(crop: Crop, cropData: CropData, db: any): Promise<boolean> {
  const expectedStage = calcExpectedStage(crop, cropData);
  if (!expectedStage || expectedStage === crop.plantStage) return false;
  if (crop.plantStage === 'Harvested' || crop.plantStage === 'Deleted') return false;
  if (crop.status === 'Harvested' || crop.status === 'Deleted') return false;

  const isTrayOrBed = crop.plantingMethod === 'Seed Tray' || crop.plantingMethod === 'Seed Bed';
  const isPot = crop.plantingMethod === 'Pot';
  const needsTransplant = isPot || (cropData.transplant_days || 0) > 0;

  // Seed tray/bed: wait at Seedling until manually up-planted
  if (isTrayOrBed && crop.plantStage === 'Seedling' && !crop.transplantDateActual) return false;
  // Pot or transplant-needed crops: wait at Seedling until manually transplanted
  if (needsTransplant && crop.plantStage === 'Seedling' && !crop.transplantDateActual) return false;

  const seq = getStageSequence(cropData);

  // Map special manual stages to their position in the base sequence
  const manualStageMapping: Record<string, string> = {
    'Up-planted': 'Seedling',
    'Transplanted': 'Seedling',
  };
  const mapped = manualStageMapping[crop.plantStage] || crop.plantStage;
  const currentIdx = getStageIndex(mapped, seq);
  const expectedIdx = getStageIndex(expectedStage, seq);
  if (currentIdx < 0 || expectedIdx < 0) return false;
  if (expectedIdx <= currentIdx) return false;

  // Advance one stage at a time
  const nextStage = seq[currentIdx + 1];
  if (!nextStage) return false;

  // Manual-only stages (must be set by user)
  const MANUAL_STAGES = ['Germinated', 'Up-planted', 'Transplanted', 'Harvested'];
  if (MANUAL_STAGES.includes(nextStage)) return false;

  const { updatedCrop, stageLog } = processStageChange(
    crop, nextStage, today(), cropData, [], []
  );
  stageLog.notes = 'Auto-transitioned';
  await db.stageLogs.add(stageLog);
  await addDiaryEntry({
    entryType: 'stage_change',
    cropId: crop.id,
    cropName: crop.cropName,
    variety: crop.variety,
    description: `${crop.plantStage} → ${nextStage} (auto)`,
    details: crop.plantingMethod ? `Method: ${crop.plantingMethod}` : '',
  });
  await db.crops.put(updatedCrop);
  return true;
}

/** Promote next batch for continuous harvest crops */
export async function promoteNextBatch(harvestedCrop: Crop, db: any) {
  const parentId = harvestedCrop.parentCropId || harvestedCrop.id;
  const batches = await db.crops
    .where('parentCropId').equals(parentId)
    .and((c: Crop) => c.status === 'Active').toArray();
  if (batches.length === 0) return;
  batches.sort((a: Crop, b: Crop) => a.batchNumber - b.batchNumber);
  const nextParent = batches[0];
  const originalName = harvestedCrop.cropName.split(' [Batch')[0];
  await db.crops.update(nextParent.id, {
    cropName: originalName, parentCropId: undefined, batchNumber: 1, updatedAt: Date.now()
  });
  for (let i = 1; i < batches.length; i++) {
    const batch = batches[i];
    await db.crops.update(batch.id, {
      parentCropId: nextParent.id, batchNumber: i + 1,
      cropName: `${originalName} [Batch ${i + 1}]`, updatedAt: Date.now()
    });
  }
}

export function autoAdjustTransplantSchedule(crop: Crop, cropData: CropData | null): Crop | null {
  if (!crop.transplantDateScheduled || crop.transplantDateActual) return null;
  const sched = parseDate(crop.transplantDateScheduled);
  const now = today();
  if (!sched) return null;
  if (sched < now) {
    return { ...crop, transplantDateScheduled: formatDateShort(now), updatedAt: Date.now() };
  }
  return null;
}
