import type { CropDbAdjustment, PropDbAdjustment } from '../types';
import { generateId } from './ids';
import { formatDateShort, today } from './dates';
import { buildDocsFromDexie } from './micro-crop/dataset';
import { trainFromDocs } from './micro-crop/trainer';
import { saveMicroModel, loadMicroModel } from './micro-crop/store';
import { MICRO_TRAIN_MIN_DOCS } from './micro-crop/index';
import db from '../db/db';

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
    updatedAt: Date.now(),
  };
}

/**
 * Micro-crop trigger — call after any harvest log write.
 * Builds docs from Dexie, trains tiny transformer if docs >= threshold,
 * persists serialized params to microModels. Runs idle so UI stays snappy.
 * Falls back gracefully when docs insufficient.
 */
let trainingInFlight = false;
export async function triggerMicroTraining(cropDb?: Record<string, unknown>): Promise<void> {
  if (trainingInFlight) return;
  trainingInFlight = true;
  try {
    const [crops, harvestLogs, stageLogs] = await Promise.all([
      db.crops.toArray(),
      db.harvestLogs.toArray(),
      db.stageLogs.toArray(),
    ]);
    // resolve cropDb if not passed
    let resolvedCropDb: Record<string, unknown> = (cropDb ?? {}) as Record<string, unknown>;
    if (!cropDb) {
      try {
        const raw = localStorage.getItem('cropmanager_settings');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.state?.cropDb) resolvedCropDb = parsed.state.cropDb;
        }
      } catch (e) {
        console.warn('[micro-crop] settings parse failed, training on empty cropDb', e);
      }
    }
    const docs = buildDocsFromDexie(crops as never, harvestLogs as never, stageLogs as never, resolvedCropDb);
    if (docs.length < MICRO_TRAIN_MIN_DOCS) return; // need minimal docs
    const trainSteps = docs.length < 20 ? 400 : 800;
    const result = await trainFromDocs(docs, { numSteps: trainSteps, seed: 42 });
    if (!result) return;
    // Keep-best: never overwrite a better model with a higher-loss retrain
    try {
      const existing = await loadMicroModel();
      if (existing && existing.finalLoss <= result.finalLoss) return;
    } catch { /* compare failed — save anyway */ }
    await saveMicroModel({
      serialized: result.serialized,
      config: result.config,
      itos: result.tokenizer.itos,
      finalLoss: result.finalLoss,
      steps: result.steps,
      docsCount: docs.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (e) {
    console.warn('[micro-crop] training failed', e);
  } finally {
    trainingInFlight = false;
  }
}

export function scheduleMicroTraining(cropDb?: Record<string, unknown>): void {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  const fn = () => { void triggerMicroTraining(cropDb); };
  if (ric) ric(fn, { timeout: 4000 });
  else setTimeout(fn, 1200);
}
