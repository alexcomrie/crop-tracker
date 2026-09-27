import db from '../db/db';
import type { Crop, CropData, PersonalCropData } from '../types';
import { resolveCropData } from './cropDb';
import { daysBetween, parseDate } from './dates';
import { PERSONAL_OVERRIDE_SAMPLES } from './micro-crop/index';

// Foundation DB only as reference; personal DB is built from actual grow logs
export async function upsertPersonalFromCrop(crop: Crop, harvestDays?: number) {
  const key = crop.cropName.toLowerCase().trim();
  const existing = await db.personalCropDb.get(key).catch(() => null) as unknown as PersonalCropData | undefined;
  const now = Date.now();

  // derive metrics from crop if available
  let growingTime = harvestDays ?? null;
  if (!growingTime) {
    const planted = parseDate(crop.plantingDate);
    const harvested = parseDate(crop.harvestDateActual) || parseDate(crop.harvestDateEstimated);
    if (planted && harvested) growingTime = daysBetween(planted, harvested);
  }

  if (existing) {
    // running average
    const count = existing.sampleCount + (growingTime ? 1 : 0);
    const avg = growingTime ? Math.round(((existing.growingTimeDays * existing.sampleCount) + growingTime) / count) : existing.growingTimeDays;
    await db.personalCropDb.put({
      ...existing,
      growingTimeDays: avg || existing.growingTimeDays,
      sampleCount: count,
      updatedAt: now,
    } as never);
    return;
  }

  // create from foundation as baseline
  let foundation: CropData | null = null;
  try {
    const raw = localStorage.getItem('cropmanager_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      foundation = resolveCropData(parsed?.state?.cropDb ?? {}, crop.cropName) as CropData | null;
    }
  } catch (e) {
    console.warn('[personalCropDb] settings parse failed, using defaults', e);
  }

  const data: PersonalCropData = {
    key,
    displayName: crop.cropName,
    plantType: foundation?.plant_type ?? 'other',
    growingTimeDays: growingTime ?? foundation?.growing_time_days ?? 60,
    transplantDays: foundation?.transplant_days ?? null,
    growingFromTransplant: foundation?.growing_from_transplant ?? null,
    harvestInterval: foundation?.harvest_interval ?? 7,
    batchOffsetDays: foundation?.batch_offset_days ?? 7,
    germinationMin: foundation?.germination_days_min ?? 5,
    germinationMax: foundation?.germination_days_max ?? 10,
    sampleCount: growingTime ? 1 : 0,
    updatedAt: now,
  };
  await db.personalCropDb.put(data as never);
}

/** Single entry point for "personal override else foundation" lookups. */
export async function resolveEffectiveCropData(cropName: string, foundationDb: Record<string, unknown>) {
  return (await getEffectiveCropData(cropName, foundationDb)) ?? resolveCropData(foundationDb as never, cropName);
}

export async function getPersonalCropData(key: string): Promise<PersonalCropData | null> {
  const v = await db.personalCropDb.get(key.toLowerCase().trim()).catch(() => null);
  return (v as unknown as PersonalCropData) ?? null;
}

export async function getEffectiveCropData(cropName: string, foundationDb: Record<string, unknown>): Promise<CropData | null> {
  const personal = await getPersonalCropData(cropName);
  const foundation = resolveCropData(foundationDb as never, cropName) as CropData | null;
  if (!personal) return foundation;
  if (!foundation) {
    // synthesize CropData from personal
    return {
      display_name: personal.displayName,
      varieties: [],
      plant_type: personal.plantType,
      growing_time_days: personal.growingTimeDays,
      transplant_days: personal.transplantDays,
      growing_from_transplant: personal.growingFromTransplant,
      harvest_interval: personal.harvestInterval,
      batch_offset_days: personal.batchOffsetDays,
      number_of_weeks_harvest: 1,
      germination_days_min: personal.germinationMin,
      germination_days_max: personal.germinationMax,
      fungus_spray_days: [],
      pest_spray_days: [],
      planting_method: 'Direct Bed',
      diseases: [],
      pests: [],
      consistent_harvest: false,
    } as CropData;
  }
  // personal overrides growing time once enough samples are gathered
  if (personal.sampleCount >= PERSONAL_OVERRIDE_SAMPLES) {
    return { ...foundation, growing_time_days: personal.growingTimeDays };
  }
  return foundation;
}
