/**
 * Hybrid learner — bridges scalar logDeviation and micro-crop transformer
 * Falls back to getAdjustedValue when micro-crop confidence is low or
 * docs insufficient.
 */
import type { Crop, CropData, CropDbAdjustment } from '../../types';
import { getAdjustedValue, calculateHarvestDate } from '../harvest';
import { parseDate, addDays } from '../dates';
import { MICRO_CONFIDENCE_THRESHOLD, MIN_DOCS_FOR_TRAINING, SCALAR_CUSTOM_SAMPLES } from './index';
import { loadModel, predictHarvestDelta } from './inference';
import type { MicroConfig } from './model';

export interface StoredMicro {
  serialized: Record<string, number[][]>;
  config: MicroConfig;
  itos: string[];
}

function monthBucket(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return 'unk';
  return ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][d.getMonth()];
}

// Cache the deserialized model by StoredMicro object identity so batch loops
// (e.g. autoUpdateService.refreshAll over all active crops) pay the
// Value-graph rebuild cost once per refresh instead of once per crop.
let cachedMicroInput: StoredMicro | null = null;
let cachedModel: import('./inference').MicroModel | null = null;

function getCachedModel(micro: StoredMicro): import('./inference').MicroModel {
  if (cachedModel && cachedMicroInput === micro) return cachedModel;
  cachedModel = loadModel(micro.serialized, micro.config, micro.itos);
  cachedMicroInput = micro;
  return cachedModel;
}

function buildPrefix(crop: Crop, cropData: CropData): string {
  const key = crop.cropName.toLowerCase().replace(/\s+/g, '_').slice(0, 12);
  const varCode = (crop.variety || 'std').toLowerCase().replace(/\s+/g, '_').slice(0, 8);
  const meth = (crop.plantingMethod || 'direct').toLowerCase().replace(/\s+/g, '_').slice(0, 6);
  const ptype = (cropData.plant_type || 'other').slice(0, 4);
  const mon = monthBucket(crop.plantingDate);
  const dbDays = cropData.growing_time_days ?? 60;
  // prefix stops before delta char, so model predicts it
  return `${key}|${varCode}|${meth}:${mon}/${ptype} ${dbDays}~`;
}

export async function getPredictedHarvestDate(
  crop: Crop,
  cropData: CropData,
  adjustments: CropDbAdjustment[],
  micro: StoredMicro | null,
  threshold = 3
): Promise<Date | null> {
  const fallback = calculateHarvestDate(crop, cropData, adjustments, threshold);

  if (!micro || !micro.serialized || !micro.config || !micro.itos) return fallback;

  try {
    const model = getCachedModel(micro);
    const prefix = buildPrefix(crop, cropData);
    const { deltaDays, confidence } = predictHarvestDelta(model, prefix, 42);

    if (confidence < MICRO_CONFIDENCE_THRESHOLD) return fallback;

    // Delta is (actual - dbDays). So predicted actual = dbDays + delta
    const dbDays = cropData.growing_time_days ?? 60;
    const predictedActual = dbDays + deltaDays;

    // Also respect scalar learned average if it is high-confidence (>=threshold)
    // Blend: 70% micro, 30% scalar if scalar active
    const key = crop.cropName.toLowerCase();
    const field = crop.transplantDateActual ? 'growing_from_transplant' : 'growing_time_days';
    const defaultVal = field === 'growing_from_transplant'
      ? (cropData.growing_from_transplant ?? dbDays)
      : dbDays;
    const scalarVal = getAdjustedValue(key, field, defaultVal, crop.variety, adjustments, threshold);
    const hasScalarOverride = scalarVal !== defaultVal;

    let finalDays = predictedActual;
    if (hasScalarOverride) {
      finalDays = Math.round(predictedActual * 0.7 + scalarVal * 0.3);
    }

    const planted = parseDate(crop.plantingDate);
    if (!planted) return fallback;

    // If transplanted, predicted growing_from_transplant vs growing_time_days
    if (crop.transplantDateActual) {
      const t = parseDate(crop.transplantDateActual);
      if (t) return addDays(t, finalDays);
    }
    if (crop.transplantDateScheduled && !crop.transplantDateActual) {
      const ts = parseDate(crop.transplantDateScheduled);
      if (ts && field === 'growing_from_transplant') return addDays(ts, finalDays);
    }
    return addDays(planted, finalDays);
  } catch {
    return fallback;
  }
}

export function shouldUseMicro(adjustments: CropDbAdjustment[], docsCount: number): boolean {
  return docsCount >= MIN_DOCS_FOR_TRAINING || adjustments.some(a => a.sampleCount >= SCALAR_CUSTOM_SAMPLES && a.useCustom === 'Yes');
}
