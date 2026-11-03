import db from '../db/db';
import { generateId } from './ids';
import type { FarmPoint, PointTagDraft } from '../types';

/**
 * Point tags live in one table so the dashboard map and Area Mapper show the
 * same markers. Forms only ever produce a PointTagDraft (placed by map tap or
 * GPS) — no raw latitude/longitude typing anywhere.
 */
export interface PointTagLinks {
  linkedCropId?: string;
  linkedObservationId?: string;
  linkedAreaId?: string;
}

/** Create or update the FarmPoint backing a draft. Returns the point id. */
export async function savePointTag(
  draft: PointTagDraft,
  links: PointTagLinks = {},
  existingId?: string,
): Promise<string> {
  const now = Date.now();
  const point: FarmPoint = {
    id: existingId || generateId('PT'),
    landId: draft.landId,
    point: draft.point,
    label: draft.label.trim() || 'Point tag',
    kind: draft.kind,
    notes: draft.notes?.trim() || undefined,
    source: draft.source,
    ...links,
    createdAt: new Date(now).toISOString(),
    updatedAt: now,
  };

  if (existingId) {
    const previous = await db.farmPoints.get(existingId).catch(() => undefined);
    if (previous) {
      // Keep the original creation time when refreshing an existing tag.
      point.createdAt = previous.createdAt;
      await db.farmPoints.put({ ...previous, ...point, createdAt: previous.createdAt });
      return point.id;
    }
  }
  await db.farmPoints.put(point);
  return point.id;
}

/** Remove a tag that a form cleared or replaced. */
export async function deletePointTag(id?: string | null): Promise<void> {
  if (!id) return;
  await db.farmPoints.delete(id).catch(() => undefined);
}

/** Convert a stored tag back into an editable draft. */
export function pointToDraft(point: FarmPoint): PointTagDraft {
  return {
    landId: point.landId,
    point: point.point,
    label: point.label,
    kind: point.kind,
    notes: point.notes,
    source: point.source,
  };
}
