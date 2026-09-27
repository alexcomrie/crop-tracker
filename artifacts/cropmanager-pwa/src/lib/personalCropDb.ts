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
    fruitGrowthDays: null,
    fruitSampleCount: 0,
    updatedAt: now,
  };
  await db.personalCropDb.put(data as never);
}

/**
 * Approximate event-to-maturity days (pollination/flower → ripe) from
 * horticultural extension publications. Seed defaults only — every finished
 * field tracking overrides these with real farm data via
 * upsertPersonalFruitMaturity. Keys are lowercase crop names/display names.
 */
export const FRUIT_MATURITY_DEFAULTS: Record<string, number> = {
  watermelon: 40,
  melon: 40,
  cantaloupe: 40,
  tomato: 50,
  tomatoes: 50,
  tomatillo: 55,
  'sweet pepper': 60,
  'bell pepper': 60,
  pepper: 60,
  'hot pepper': 60,
  chili: 60,
  eggplant: 30,
  okra: 5,
  cucumber: 16,
  cucumbers: 16,
  pumpkin: 50,
  squash: 30,
  zucchini: 8,
  corn: 22,
  'string beans': 12,
  'green beans': 12,
  'kidney beans': 12,
  peas: 20,
  'red peas': 25,
  'gungo peas': 25,
  'pigeon peas': 25,
};

/** Research seed default for a crop's fruit maturation, if known. */
export function foundationFruitDefault(cropName: string): number | null {
  return FRUIT_MATURITY_DEFAULTS[cropName.toLowerCase().trim()] ?? null;
}

/**
 * Feed a finished fruit tracking into the personal database: running average
 * of actual event-to-ripe days plus sample count. Creates the personal record
 * (from foundation baseline) when none exists yet.
 */
export async function upsertPersonalFruitMaturity(cropName: string, elapsedDays: number) {
  const key = cropName.toLowerCase().trim();
  if (!key) return;
  const now = Date.now();
  const elapsed = Math.max(0, Math.round(elapsedDays));
  const existing = await db.personalCropDb.get(key).catch(() => null) as unknown as PersonalCropData | undefined;
  if (existing) {
    const count = (existing.fruitSampleCount ?? 0) + 1;
    const prev = existing.fruitGrowthDays ?? elapsed;
    const avg = Math.round(((prev * (existing.fruitSampleCount ?? 0)) + elapsed) / count);
    await db.personalCropDb.put({ ...existing, fruitGrowthDays: avg, fruitSampleCount: count, updatedAt: now } as never);
    return;
  }
  let foundation: CropData | null = null;
  try {
    const raw = localStorage.getItem('cropmanager_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      foundation = resolveCropData(parsed?.state?.cropDb ?? {}, cropName) as CropData | null;
    }
  } catch (e) {
    console.warn('[personalCropDb] settings parse failed, using defaults', e);
  }
  const data: PersonalCropData = {
    key,
    displayName: cropName.trim(),
    plantType: foundation?.plant_type ?? 'other',
    growingTimeDays: foundation?.growing_time_days ?? 60,
    transplantDays: foundation?.transplant_days ?? null,
    growingFromTransplant: foundation?.growing_from_transplant ?? null,
    harvestInterval: foundation?.harvest_interval ?? 7,
    batchOffsetDays: foundation?.batch_offset_days ?? 7,
    germinationMin: foundation?.germination_days_min ?? 5,
    germinationMax: foundation?.germination_days_max ?? 10,
    sampleCount: 0,
    fruitGrowthDays: elapsed,
    fruitSampleCount: 1,
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
