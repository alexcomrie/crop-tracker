/**
 * Vegetative planting methods (cutting / division / grafting) never pass
 * through a true seed stage — they start as living plant tissue.
 *
 * - Cutting: a piece of the parent plant rooted to grow on its own.
 * - Division: multi-bulb/clump crops (e.g. scallion, chives) split and
 *   replanted as separate plants — already have roots + leaves.
 * - Grafted: scion joined to rootstock, heals then grows vegetatively.
 *
 * All three therefore start at Seedling in the tracker ( observable green
 * growth ), skipping Seed → Germinated. Seed methods keep the full flow.
 */

export type MethodStart = 'Seed' | 'Seedling';

const VEGETATIVE_METHODS = new Set(['cuttings', 'division', 'grafted']);

export function normalizeMethod(method?: string): string {
  return (method ?? '').trim().toLowerCase();
}

/** Stage a new crop should be created at for the given planting method. */
export function startStageForMethod(method?: string): MethodStart {
  return VEGETATIVE_METHODS.has(normalizeMethod(method)) ? 'Seedling' : 'Seed';
}

/** True for cutting / division / grafted plantings. */
export function isVegetativeMethod(method?: string): boolean {
  return VEGETATIVE_METHODS.has(normalizeMethod(method));
}

/**
 * One-time forward migration for crops created before this rule existed:
 * vegetative-method crops stuck at Seed/Germinated move to Seedling and
 * get germinationDate backfilled so auto-transitions and age math work.
 * Returns the patch to apply, or null when nothing is needed.
 */
export function migrateVegetativeCrop(crop: {
  plantingMethod?: string;
  plantStage?: string;
  plantingDate?: string;
  germinationDate?: string;
}): { plantStage: string; germinationDate: string } | null {
  if (!isVegetativeMethod(crop.plantingMethod)) return null;
  const stage = (crop.plantStage ?? '').trim();
  if (stage !== 'Seed' && stage !== 'Germinated') return null;
  return {
    plantStage: 'Seedling',
    germinationDate: crop.germinationDate || crop.plantingDate || '',
  };
}
