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

export function getValidNextStages(currentStage: string, cropData: CropData | null): string[] {
  const seq = getStageSequence(cropData);
  const idx = seq.indexOf(currentStage);
  if (idx === -1) {
    if (currentStage === 'Grafting') return ['Healing'];
    if (currentStage === 'Healing') return ['Seedling', 'Transplanted'];
    if (currentStage === 'Transplanted') {
      const nextSeq = seq.slice(seq.indexOf('Seedling') + 1).filter(s => s !== 'Harvested');
      return [...nextSeq, 'Harvested'];
    }
    return ['Harvested', 'Deleted'];
  }
  const next = seq.slice(idx + 1, idx + 2);
  if (currentStage === 'Seedling') {
    const hasTransplant = cropData && cropData.transplant_days != null && cropData.transplant_days > 0;
    if (hasTransplant) return ['Transplanted', ...seq.slice(idx + 1)];
    return seq.slice(idx + 1);
  }
  return next.length > 0 ? next : ['Harvested', 'Deleted'];
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

/** Calculate which stage the crop should be in based on days since planting */
export function calcExpectedStage(crop: Crop, cropData: CropData | null): string | null {
  if (!cropData) return null;
  const planted = parseDate(crop.plantingDate);
  if (!planted) return null;
  const seq = getStageSequence(cropData);
  const daysElapsed = daysBetween(planted, today());
  const totalDays = cropData.growing_time_days || 60;

  if (daysElapsed <= 0) return 'Seed';
  if (daysElapsed >= totalDays) return 'Harvested';

  // For transplant-based crops, check if transplant has happened
  const transplantDays = cropData.transplant_days || 0;
  const needsTransplant = transplantDays > 0;
  const isTransplanted = !!crop.transplantDateActual;

  const germMax = cropData.germination_days_max || 7;
  if (daysElapsed <= germMax) return 'Germinated';

  if (needsTransplant && !isTransplanted) {
    if (daysElapsed <= transplantDays) return 'Seedling';
    return null; // waiting for manual transplant
  }

  const type = getPlantType(cropData);
  const pct = daysElapsed / totalDays;

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

  // For transplant-based crops: wait at Seedling until manually transplanted
  const needsTransplant = (cropData.transplant_days || 0) > 0;
  if (needsTransplant && crop.plantStage === 'Seedling' && !crop.transplantDateActual) return false;

  const seq = getStageSequence(cropData);
  const currentIdx = getStageIndex(crop.plantStage, seq);
  const expectedIdx = getStageIndex(expectedStage, seq);
  if (currentIdx < 0 || expectedIdx < 0) return false;
  if (expectedIdx <= currentIdx) return false;

  // Advance one stage at a time
  const nextStage = seq[currentIdx + 1];
  if (!nextStage) return false;

  // Germinated and Harvested must be set manually
  if (nextStage === 'Germinated' || nextStage === 'Harvested') return false;

  const { updatedCrop, stageLog } = processStageChange(
    crop, nextStage, today(), cropData, [], []
  );
  stageLog.notes = 'Auto-transitioned';
  await db.stageLogs.add(stageLog);
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
