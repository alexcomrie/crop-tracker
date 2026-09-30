import type { Crop, StageLog, HarvestLog, CropData, CropDbAdjustment } from '../types';
import { generateId } from './ids';
import { parseDate, formatDateShort, formatDateStored, daysBetween, addDays, today } from './dates';
import { getAdjustedValue, calculateHarvestDate } from './harvest';
import { addDiaryEntry } from './diary';

// ─── New canonical stage sequence (Harvested/Deleted removed from stages) ───
export const CANONICAL_STAGES = [
  'Seed',
  'Germinated',
  'Seedling',
  'Vegetative Early',
  'Vegetative Middle',
  'Vegetative Late',
  'Flowering',
  'Fruiting',
] as const;

export type CanonicalStage = typeof CANONICAL_STAGES[number];

// Legacy alias map for backwards compat
const LEGACY_MAP: Record<string, string> = {
  Vegetative: 'Vegetative Middle',
  'Middle Vegetative': 'Vegetative Middle',
  'Final Vegetative': 'Vegetative Late',
  'Up-planted': 'Seedling',
  Transplanted: 'Seedling',
  Harvested: 'Fruiting',
  Deleted: 'Seed',
};

export function normalizeStage(s: string): string {
  if ((CANONICAL_STAGES as readonly string[]).includes(s)) return s;
  return LEGACY_MAP[s] ?? s;
}

export function getPlantType(cropData: CropData | null): 'fruit' | 'leafy' | 'other' {
  if (!cropData) return 'other';
  const t = (cropData.plant_type || '').toLowerCase();
  if (t.includes('fruit') || t.includes('vine') || t.includes('legume') || t.includes('grain')) return 'fruit';
  if (t.includes('leaf') || t.includes('brassica') || t.includes('herb') || t.includes('bulb') || t.includes('rhizome')) return 'leafy';
  return 'other';
}

// New stage sequence always canonical
export function getStageSequence(_cropData: CropData | null): string[] {
  return [...CANONICAL_STAGES];
}

export function getValidNextStages(currentStage: string, cropData: CropData | null, plantingMethod?: string): string[] {
  const normalized = normalizeStage(currentStage);
  const seq = getStageSequence(cropData);
  const idx = seq.indexOf(normalized);
  const result: string[] = [];

  // Always allow regression to previous stage (manual correction)
  if (idx > 0) result.push(seq[idx - 1]);

  // Allow forward one
  if (idx >= 0 && idx < seq.length - 1) {
    const next = seq[idx + 1];
    // Seed -> Germinated is manual, but still allow selecting
    result.push(next);
  }

  // Seedling special: tray/bed requires up-potted or transplanted before vegetative
  if (normalized === 'Seedling') {
    const isTrayOrBed = plantingMethod === 'Seed Tray' || plantingMethod === 'Seed Bed';
    // Up-potted / Transplanted are not stages but actions - we still expose as selectable
    // to record the action; they keep stage as Seedling but set flags.
    if (isTrayOrBed) {
      if (!result.includes('Up-planted')) result.push('Up-planted');
      if (!result.includes('Transplanted')) result.push('Transplanted');
    } else {
      // direct methods: transplant is optional but allowed
      if (cropData?.transplant_days && cropData.transplant_days > 0) {
        if (!result.includes('Transplanted')) result.push('Transplanted');
      }
    }
  }
  if (normalized === 'Up-planted') {
    if (!result.includes('Transplanted')) result.push('Transplanted');
  }

  return [...new Set(result)];
}

export function getStagesForCrop(_cropData: CropData | null): string[] {
  return [...CANONICAL_STAGES];
}

export function getFilterStages(_cropData: CropData | null): string[] {
  return [...CANONICAL_STAGES];
}

export function getStageIndex(stage: string, seq: string[]): number {
  return seq.indexOf(normalizeStage(stage));
}

// ─── Stage transition with new semantics ───
export function processStageChange(
  crop: Crop,
  newStage: string,
  date: Date,
  cropData: CropData | null,
  adjustments: CropDbAdjustment[],
  existingHarvestLogs: HarvestLog[] = [],
  threshold = 3
): { updatedCrop: Crop; stageLog: StageLog; harvestLog?: HarvestLog } {
  const dateStr = formatDateShort(date);
  const normalized = normalizeStage(newStage);
  const isAction = newStage === 'Up-planted' || newStage === 'Transplanted';
  const effectiveStage = isAction ? crop.plantStage : normalized;

  const stageLog: StageLog = {
    id: generateId('SL'),
    trackingId: crop.id,
    cropName: crop.cropName,
    variety: crop.variety,
    stageFrom: crop.plantStage,
    stageTo: isAction ? newStage : effectiveStage,
    date: dateStr,
    daysElapsed: 0,
    method: crop.plantingMethod,
    notes: isAction ? `Action: ${newStage}` : '',
    updatedAt: Date.now(),
  };

  const updatedCrop: Crop = {
    ...crop,
    plantStage: effectiveStage,
    updatedAt: Date.now(),
  };

  const planted = parseDate(crop.plantingDate);
  if (planted) stageLog.daysElapsed = daysBetween(planted, date);

  const key = crop.cropName.toLowerCase();

  if (normalized === 'Germinated') {
    updatedCrop.germinationDate = dateStr;
    if (planted) updatedCrop.daysSeedGerm = daysBetween(planted, date);
    const transplantDays = getAdjustedValue(key, 'transplant_days', cropData?.transplant_days ?? 0, crop.variety, adjustments, threshold);
    if (transplantDays > 0) updatedCrop.transplantDateScheduled = formatDateStored(addDays(date, transplantDays));
    const harvestDate = calculateHarvestDate({ ...updatedCrop } as Crop, cropData, adjustments, threshold);
    if (harvestDate) updatedCrop.harvestDateEstimated = formatDateStored(harvestDate);
  }

  if (newStage === 'Up-planted') {
    // keep stage as Seedling, set flag via upPottedDate
    (updatedCrop as unknown as Record<string, unknown>).upPottedDate = dateStr;
    stageLog.daysElapsed = planted ? daysBetween(planted, date) : 0;
  }

  if (newStage === 'Transplanted') {
    updatedCrop.transplantDateActual = dateStr;
    const germDate = parseDate(crop.germinationDate);
    if (germDate) updatedCrop.daysGermTransplant = daysBetween(germDate, date);
    const harvestDate = calculateHarvestDate({ ...updatedCrop } as Crop, cropData, adjustments, threshold);
    if (harvestDate) updatedCrop.harvestDateEstimated = formatDateStored(harvestDate);
  }

  // Harvested is not a stage now - handled separately via harvest log creation,
  // but keep support for legacy calls
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

/** Calculate expected stage autonomous, respecting conditions */
export function calcExpectedStage(crop: Crop, cropData: CropData | null): string | null {
  if (!cropData) return null;
  if (!crop.germinationDate) return 'Seed';

  const germDate = parseDate(crop.germinationDate);
  if (!germDate) return 'Seed';

  const daysSinceGerm = daysBetween(germDate, today());
  const totalDays = cropData.growing_time_days || 60;

  // Condition #2 Germinated -> Seedling after 7 days
  if (normalizeStage(crop.plantStage) === 'Germinated') {
    if (daysSinceGerm < 7) return 'Germinated';
    return 'Seedling';
  }

  // Seedling gating Condition #3
  const isTrayOrBed = crop.plantingMethod === 'Seed Tray' || crop.plantingMethod === 'Seed Bed';
  if (normalizeStage(crop.plantStage) === 'Seedling') {
    if (isTrayOrBed && !crop.transplantDateActual) {
      // need transplant before vegetative
      return 'Seedling';
    }
    // If transplanted, wait 14-17 days before vegetative early (~15 days avg)
    if (crop.transplantDateActual) {
      const transDate = parseDate(crop.transplantDateActual);
      if (transDate) {
        const daysSinceTrans = daysBetween(transDate, today());
        if (daysSinceTrans < 15) return 'Seedling';
        return 'Vegetative Early';
      }
    }
    // Direct sown without transplant: after 7+15=22 days since germ approx
    if (daysSinceGerm < 21) return 'Seedling';
    return 'Vegetative Early';
  }

  // If still before transplant but should be vegetative, handle vegetative progression
  if (crop.plantStage === 'Seedling' && !isTrayOrBed) {
    // already handled above
  }

  // Vegetative & Flowering progression proportional to remaining days
  // Use tinygpt-adjusted total if available via growing_time_days personal override
  const transplantDate = parseDate(crop.transplantDateActual || crop.transplantDateScheduled);
  const baseDate = transplantDate || germDate;
  const daysSinceBase = daysBetween(baseDate, today());
  // Remaining after seedling phase (~22 days from germ)
  const effectiveTotal = Math.max(1, totalDays - 7);
  const adjustedDays = Math.max(0, daysSinceBase - 5); // buffer
  const pct = adjustedDays / effectiveTotal;

  // Split vegetative into 3 parts, then flowering, fruiting
  // 0-0.25 Early, 0.25-0.45 Middle, 0.45-0.60 Late, 0.60-0.75 Flowering, 0.75+ Fruiting
  if (pct < 0.25) return 'Vegetative Early';
  if (pct < 0.45) return 'Vegetative Middle';
  if (pct < 0.60) return 'Vegetative Late';
  if (pct < 0.75) return 'Flowering';
  return 'Fruiting';
}

export const STAGE_COLORS: Record<string, string> = {
  Seed: '#9e9e9e',
  Germinated: '#aed581',
  Seedling: '#8bc34a',
  'Vegetative Early': '#66bb6a',
  'Vegetative Middle': '#43a047',
  'Vegetative Late': '#2e7d32',
  Flowering: '#ffb300',
  Fruiting: '#f57c00',
  'Up-planted': '#78909c',
  Transplanted: '#26a69a',
  Grafting: '#7e57c2',
  Healing: '#ba68c8',
  Harvested: '#5d4037',
  Deleted: '#e53935',
  // legacy aliases
  Vegetative: '#66bb6a',
  'Middle Vegetative': '#66bb6a',
  'Final Vegetative': '#43a047',
};

const VINE_FAMILY = ['watermelon', 'melon', 'pumpkin', 'cucumber', 'squash', 'zucchini', 'gourd', 'cantaloupe'];

export function isVineFamily(cropName: string, plantType?: string): boolean {
  const name = cropName.toLowerCase();
  const type = (plantType || '').toLowerCase();
  return VINE_FAMILY.some(v => name.includes(v)) || type.includes('vine');
}

/** Auto-transition using new calcExpectedStage */
export async function autoTransitionCrop(crop: Crop, cropData: CropData, db: any): Promise<boolean> {
  const expectedStage = calcExpectedStage(crop, cropData);
  if (!expectedStage) return false;
  const normalizedCurrent = normalizeStage(crop.plantStage);
  if (expectedStage === normalizedCurrent) return false;
  if (crop.status === 'Harvested' || crop.status === 'Deleted') return false;

  const isTrayOrBed = crop.plantingMethod === 'Seed Tray' || crop.plantingMethod === 'Seed Bed';
  const needsUpPottedOrTransplant = isTrayOrBed && normalizedCurrent === 'Seedling' && !crop.transplantDateActual;
  if (needsUpPottedOrTransplant) return false;

  // Seed must be manual
  if (normalizedCurrent === 'Seed') return false;

  const seq = getStageSequence(cropData);
  const currentIdx = seq.indexOf(normalizedCurrent);
  const expectedIdx = seq.indexOf(expectedStage);
  if (currentIdx < 0 || expectedIdx < 0) return false;
  if (expectedIdx <= currentIdx) return false;
  // Only advance one stage at a time
  const nextStage = seq[currentIdx + 1];
  if (!nextStage) return false;
  // Germinated should have already been handled but guard
  if (nextStage === 'Germinated') return false;

  const { updatedCrop, stageLog } = processStageChange(crop, nextStage, today(), cropData, [], []);
  stageLog.notes = 'Auto-transitioned (tinygpt-guided)';
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

export async function promoteNextBatch(harvestedCrop: Crop, db: any) {
  const parentId = harvestedCrop.parentCropId || harvestedCrop.id;
  const batches = await db.crops
    .where('parentCropId').equals(parentId)
    .and((c: Crop) => c.status === 'Active').toArray();
  if (batches.length === 0) return;
  batches.sort((a: Crop, b: Crop) => a.batchNumber - b.batchNumber);
  const nextParent = batches[0];
  const originalName = harvestedCrop.cropName.split(' [Batch')[0];
  // Single transaction: promotion is all-or-nothing, not N sequential writes
  await db.transaction('rw', db.crops, async () => {
    await db.crops.update(nextParent.id, {
      cropName: originalName, parentCropId: '', batchNumber: 1, updatedAt: Date.now()
    });
    for (let i = 1; i < batches.length; i++) {
      const batch = batches[i];
      await db.crops.update(batch.id, {
        parentCropId: nextParent.id, batchNumber: i + 1,
        cropName: `${originalName} [Batch ${i + 1}]`, updatedAt: Date.now()
      });
    }
  });
}

export function autoAdjustTransplantSchedule(crop: Crop, cropData: CropData | null): Crop | null {
  if (!crop.transplantDateScheduled || crop.transplantDateActual) return null;
  const sched = parseDate(crop.transplantDateScheduled);
  const now = today();
  if (!sched) return null;
  if (sched < now) {
    return { ...crop, transplantDateScheduled: formatDateStored(now), updatedAt: Date.now() };
  }
  return null;
}
