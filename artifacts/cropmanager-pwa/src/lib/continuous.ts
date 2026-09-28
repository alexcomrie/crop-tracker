import type { CropData, CropDbAdjustment } from '../types';
import { SCALAR_CUSTOM_SAMPLES } from './micro-crop/index';

/**
 * Canonical continuous-harvest math, shared by the C-H calculator,
 * the create wizard, and the background auto-update.
 *
 * Core rule (validated against extension succession-planting guidance):
 * the planting interval EQUALS the desired harvest frequency. Once the
 * rotation fills, a new batch matures every interval, giving harvests on
 * exactly that cadence. Foundation/micro/learned values only choose the
 * DEFAULT interval — the user's frequency choice always drives the plan.
 */
export type BatchOffsetSource = 'learned' | 'tinygpt' | 'database' | 'default' | 'custom';

/** Planting interval for a desired harvest frequency. Frequency always wins. */
export function calcBatchOffset(freqDays: number): number {
  return Math.max(1, Math.round(freqDays) || 7);
}

export function calcNumBatches(cropData: CropData, batchOffset: number): number {
  const growDays = cropData.growing_time_days || 60;
  const harvestWks = cropData.number_of_weeks_harvest || 1;
  const harvestDays = harvestWks * 7;
  const isMulti = harvestWks > 1;
  if (!isMulti) return Math.ceil(growDays / batchOffset);
  return Math.max(2, Math.ceil(harvestDays / batchOffset));
}

export interface BatchOffsetResolution {
  offset: number;
  /** Where the default came from: learned actuals > tinygpt > foundation DB > fallback. */
  source: Exclude<BatchOffsetSource, 'custom'>;
}

/**
 * Self-tuning default planting interval for a crop, like the crop DB
 * self-tunes growing times: actual logged cadence first, then the
 * Tinygpt prediction, then the foundation value, then the fallback.
 * A manual frequency choice (UI) always overrides this default.
 */
export function resolveBatchOffset(opts: {
  cropKey: string;
  variety: string;
  cropData: CropData;
  adjustments: CropDbAdjustment[];
  microBatch: number | null;
  fallbackFreq: number;
  threshold?: number;
}): BatchOffsetResolution {
  const { cropKey, variety, cropData, adjustments, microBatch, fallbackFreq } = opts;
  const threshold = opts.threshold ?? SCALAR_CUSTOM_SAMPLES;
  const key = cropKey.toLowerCase();
  const learned = adjustments.find(a =>
    a.cropKey === key &&
    a.field === 'batch_offset' &&
    (a.variety === variety || a.variety === '') &&
    a.useCustom === 'Yes' &&
    a.sampleCount >= threshold
  );
  if (learned && learned.yourAverage > 0) {
    return { offset: Math.max(1, Math.round(learned.yourAverage)), source: 'learned' };
  }
  if (microBatch && microBatch > 3 && microBatch < 60) {
    return { offset: Math.round(microBatch), source: 'tinygpt' };
  }
  if (cropData.batch_offset_days && cropData.batch_offset_days > 0) {
    return { offset: Math.round(cropData.batch_offset_days), source: 'database' };
  }
  return { offset: Math.max(1, Math.round(fallbackFreq) || 7), source: 'default' };
}
