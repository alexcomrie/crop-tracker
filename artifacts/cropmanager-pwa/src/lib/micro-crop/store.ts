/**
 * Persistence helpers for micro-crop model in Dexie
 */
import db from '../../db/db';
import type { StoredMicroModel } from './index';
import { MICRO_MODEL_ID } from './index';

export async function saveMicroModel(model: Omit<StoredMicroModel, 'id'>): Promise<void> {
  const existing = await db.microModels.get(MICRO_MODEL_ID).catch(() => null);
  const doc: StoredMicroModel = { id: MICRO_MODEL_ID, ...model };
  if (existing) await db.microModels.put(doc as never);
  else await db.microModels.add(doc as never);
}

export async function loadMicroModel(): Promise<StoredMicroModel | null> {
  try {
    const m = await db.microModels.get(MICRO_MODEL_ID);
    return (m as unknown as StoredMicroModel) ?? null;
  } catch { return null; }
}

export async function clearMicroModel(): Promise<void> {
  try { await db.microModels.delete(MICRO_MODEL_ID); } catch { /* ignore */ }
}
